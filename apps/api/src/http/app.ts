import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type {
  AnonymousSession,
  ChildProfile,
  ProfileConsent,
  Fact,
  FactOption,
  FactType,
  Project,
  StoryConcept,
  Theme,
  ThemeCategory
} from "@for-little-ones/domain";
import {
  ageYearsOn,
  FACT_TYPES,
  isLocale,
  listCategories,
  listThemes,
  sortThemes,
  getTheme
} from "@for-little-ones/domain";
import type { AnalyticsEvent, EventSink } from "../analytics/event-sink";
import { isAllowListedEvent } from "../analytics/event-names";
import { BookService, REGENERATE_BUDGET_DEFAULT } from "../creation/book-service";
import type { CreationStore } from "../creation/creation-store";
import { ConceptBundleRunner } from "../creation/concept-bundle-runner";
import { ChildProfileService } from "../profile/child-profile-service";
import { FactService } from "../fact/fact-service";
import { AnonymousSessionService } from "../session/session-service";
import type { SessionStore } from "../session/session-service";
import { OwnershipError, ResourceNotFoundError, UnauthenticatedError, ValidationError } from "../errors";
import { classifyError, errorBody } from "./errors";
import { SESSION_COOKIE, sessionCookieOptions, shouldRenew } from "./session-cookie";

export interface ApiDeps {
  sessions: AnonymousSessionService;
  sessionStore: SessionStore;
  creationStore: CreationStore;
  profiles: ChildProfileService;
  books: BookService;
  facts: FactService;
  runner: ConceptBundleRunner;
  events: EventSink;
  now: () => string;
  /** `Secure` is on in production and off for the Vite dev proxy over plain http. */
  secureCookies: boolean;
}

type Env = { Variables: { session: AnonymousSession } };

export function createApiApp(deps: ApiDeps): Hono<Env> {
  const app = new Hono<Env>();

  // One classification point for every route (see http/errors.ts).
  app.onError((err) => {
    const body = classifyError(err);
    return Response.json(body, { status: body.error.status });
  });
  app.notFound(() => Response.json(errorBody(404, "not_found", "no such route"), { status: 404 }));

  /** D024 §3: `resolveSession(rawToken)` as middleware. Absent/!unknown cookie ⇒ 401. */
  const requireSession = createSessionMiddleware(deps);
  app.use("/api/sessions/anonymous", async (c, next) => {
    // A restart while a cookie is still valid re-uses the session rather than
    // orphaning the parent's project.
    const existing = await resolveOptional(deps, c);
    if (existing) {
      c.set("session", existing.session);
      c.set("rawToken" as never, existing.rawToken as never);
    }
    await next();
  });

  // --- sessions -------------------------------------------------------------
  app.post("/api/sessions/anonymous", async (c) => {
    const reissued = c.get("rawToken" as never) as string | undefined;
    if (reissued) {
      const session = c.get("session");
      setCookie(c, SESSION_COOKIE, reissued, sessionCookieOptions(deps.secureCookies));
      return c.json({ session: { anonymousProjectId: session.anonymousProjectId }, project: null, reused: true });
    }
    const { session, rawToken, project } = await deps.sessions.startSession();
    setCookie(c, SESSION_COOKIE, rawToken, sessionCookieOptions(deps.secureCookies));
    await deps.events.push({
      name: "session_started",
      at: deps.now(),
      attributes: { projectId: project.projectId }
    });
    return c.json({ session: { anonymousProjectId: session.anonymousProjectId }, project, reused: false }, { status: 201 });
  });

  app.delete("/api/sessions/anonymous", requireSession, async (c) => {
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  // --- catalogue (public; childId only re-orders) ---------------------------
  app.get("/api/catalogue/categories", (c) => c.json({ categories: listCategories() as ThemeCategory[] }));

  app.get("/api/catalogue/themes", async (c) => {
    const categoryId = c.req.query("category");
    const locale = c.req.query("locale");
    const childId = c.req.query("childId");
    if (locale !== undefined && !isLocale(locale)) {
      throw new ValidationError(`unsupported locale: ${locale}`);
    }
    let themes: readonly Theme[] = listThemes();
    if (categoryId !== undefined) themes = themes.filter((t) => t.categoryId === categoryId);
    // childId re-orders only (D024/F-002): it never filters, so a child can never see
    // an empty catalogue because the profile lookup is stale.
    if (childId !== undefined) {
      const profile = await deps.creationStore.getProfile(childId);
      if (profile) {
        const ageYears = ageYearsOn(profile.dateOfBirth, deps.now().slice(0, 10));
        const ageMonths = ageYears === undefined ? undefined : ageYears * 12;
        return c.json({
          themes: sortThemes(themes, compact({ ageMonths, interests: profile.interests, locale })) as Theme[]
        });
      }
    }
    return c.json({ themes: sortThemes(themes, locale ? { locale } : {}) as Theme[] });
  });

  app.get("/api/catalogue/themes/:id", (c) => {
    const theme = getTheme(c.req.param("id"));
    if (!theme) throw new ValidationError(`unknown theme: ${c.req.param("id")}`);
    return c.json({ theme });
  });

  // --- child profiles -------------------------------------------------------
  app.post("/api/child-profiles", requireSession, async (c) => {
    const body = await readJson(c.req.raw);
    const session = c.get("session");
    const project = await ownedProject(deps, session);
    const consent = requiredAffirmation(body.consent);
    const profile = await deps.profiles.createProfile({
      anonymousProjectId: session.anonymousProjectId,
      projectId: project.projectId,
      creationToken: requiredString(body, "creationToken"),
      name: requiredString(body, "name"),
      displayName: requiredString(body, "displayName"),
      dateOfBirth: requiredString(body, "dateOfBirth"),
      pronouns: requiredString(body, "pronouns"),
      ...(optionalString(body, "locale") ? { locale: optionalString(body, "locale") as string } : {}),
      ...(optionalStringArray(body, "interests") ? { interests: optionalStringArray(body, "interests") as string[] } : {}),
      consent
    });
    return c.json({ profile }, { status: 201 });
  });

  app.get("/api/child-profiles/:id", requireSession, async (c) => {
    const profile = await hiding("child profile", c.req.param("id"), () =>
      deps.profiles.getProfile({
        anonymousProjectId: c.get("session").anonymousProjectId,
        profileId: c.req.param("id")
      })
    );
    return c.json({ profile });
  });

  app.patch("/api/child-profiles/:id", requireSession, async (c) => {
    const body = await readJson(c.req.raw);
    const expectedRevision = body.expectedRevision;
    if (typeof expectedRevision !== "number") {
      throw new ValidationError("expectedRevision (number) is required for the optimistic lock");
    }
    const profile = await hiding("child profile", c.req.param("id"), () =>
      deps.profiles.patchProfile({
        anonymousProjectId: c.get("session").anonymousProjectId,
        profileId: c.req.param("id"),
        expectedRevision,
        patch: pickProfileFields(body)
      })
    );
    return c.json({ profile });
  });

  // --- books ----------------------------------------------------------------
  app.post("/api/books", requireSession, async (c) => {
    const body = await readJson(c.req.raw);
    const session = c.get("session");
    const project = await ownedProject(deps, session);
    const book = await deps.books.createBookForChild({
      childProfileId: requiredString(body, "childProfileId"),
      anonymousProjectId: session.anonymousProjectId,
      projectId: project.projectId,
      ...(optionalString(body, "locale") ? { locale: optionalString(body, "locale") as string } : {})
    });
    const themeId = optionalString(body, "themeId");
    // An optional theme at create time is one round trip instead of two; the creation
    // state machine is the same either way.
    const themed = themeId
      ? await deps.books.selectTheme({ bookId: book.id, themeId, anonymousProjectId: session.anonymousProjectId })
      : book;
    return c.json({ book: themed }, { status: 201 });
  });

  app.get("/api/books/:id", requireSession, async (c) => {
    const session = c.get("session");
    const book = await loadOwnedBook(deps, session, c.req.param("id"));
    const profile = book.childProfileIds[0] ? await deps.creationStore.getProfile(book.childProfileIds[0]) : undefined;
    return c.json({ book, profile: profile ?? null });
  });

  app.post("/api/books/:id/theme", requireSession, async (c) => {
    const body = await readJson(c.req.raw);
    const book = await deps.books.selectTheme({
      bookId: c.req.param("id"),
      themeId: requiredString(body, "themeId"),
      anonymousProjectId: c.get("session").anonymousProjectId
    });
    return c.json({ book });
  });

  app.get("/api/books/:id/concepts", requireSession, async (c) => {
    const session = c.get("session");
    const bookId = c.req.param("id");
    const book = await loadOwnedBook(deps, session, bookId);
    const concepts = await hiding("book", bookId, () =>
      deps.books.listConcepts({ anonymousProjectId: session.anonymousProjectId, bookId })
    );
    if (concepts.length > 0) {
      return c.json({ status: "ready", conceptVersion: concepts[0]!.conceptVersion, concepts, servedFrom: "persisted" });
    }
    // Nothing persisted: either the durable unit is still working, or it died and the
    // API now owes the parent the fallback set (F-007 §9).
    const version = await nextConceptVersion(deps, bookId);
    const job = await deps.runner.jobFor(book.id, version);
    const unit = job?.units[0];
    const stillWorking = job?.status === "QUEUED" && unit !== undefined && unit.status !== "DEAD" && unit.status !== "FAILED";
    if (job && stillWorking) {
      return c.json({ status: "queued", conceptVersion: version, job: { status: job.status, unitStatus: unit?.status, attempts: unit?.attempts ?? 0 } });
    }
    const fallback = await deps.books.serveFallbackConcepts({
      bookId,
      conceptVersion: version,
      anonymousProjectId: session.anonymousProjectId
    });
    return c.json({ status: "ready", conceptVersion: version, concepts: fallback, servedFrom: "fallback" });
  });

  app.post("/api/books/:id/concepts", requireSession, async (c) => {
    const session = c.get("session");
    const bookId = c.req.param("id");
    const book = await loadOwnedBook(deps, session, bookId);
    if (!book.themeId) throw new ValidationError("choose a theme before generating concepts");
    if (c.req.query("regenerate") === "true") {
      return c.json(await regenerate(deps, session, bookId), { status: 202 });
    }
    const conceptVersion = await nextConceptVersion(deps, bookId);
    // Natural-key idempotency (D024 §6): the same (book, version) resolves to the one
    // existing unit, so a double-tap cannot spend twice.
    const job = await deps.runner.requestBundle({
      bookId,
      conceptVersion,
      anonymousProjectId: session.anonymousProjectId
    });
    return c.json({ status: "queued", conceptVersion, job: { status: job.status } }, { status: 202 });
  });

  app.post("/api/books/:id/concepts/regenerate", requireSession, async (c) => {
    return c.json(await regenerate(deps, c.get("session"), c.req.param("id")), { status: 202 });
  });

  app.post("/api/books/:id/concepts/:conceptId/select", requireSession, async (c) => {
    const session = c.get("session");
    const book = await hiding("book", c.req.param("id"), () =>
      deps.books.selectConcept({
        bookId: c.req.param("id"),
        conceptId: c.req.param("conceptId"),
        anonymousProjectId: session.anonymousProjectId
      })
    );
    return c.json({ book, selectedConceptId: book.selectedConceptId });
  });

  app.patch("/api/books/:id/concepts/:conceptId", requireSession, async (c) => {
    const body = await readJson(c.req.raw);
    const concept = await hiding("concept", c.req.param("conceptId"), () =>
      deps.books.editConcept({
      anonymousProjectId: c.get("session").anonymousProjectId,
      bookId: c.req.param("id"),
        conceptId: c.req.param("conceptId"),
        patch: titlePitchPatch(body)
      })
    );
    return c.json({ concept });
  });

  // --- facts ----------------------------------------------------------------
  app.get("/api/fact-options", requireSession, (c) => {
    const type = requiredFactType(c.req.query("type"));
    const locale = requiredLocale(c.req.query("locale"));
    return deps.facts
      .getFactOptions({ type, locale })
      .then((options) => c.json({ options: options as FactOption[] }));
  });

  app.post("/api/facts", requireSession, async (c) => {
    const body = await readJson(c.req.raw);
    if (body.state !== undefined && body.state !== "suggested") {
      throw new ValidationError(
        `state must be "suggested" when adding a fact; parentConfirmed is reachable only via POST /api/facts/{id}/confirm (F-006 §8)`
      );
    }
    const fact = await deps.facts.addFact({
      anonymousProjectId: c.get("session").anonymousProjectId,
      childProfileId: requiredString(body, "childProfileId"),
      factToken: requiredString(body, "factToken"),
      type: requiredFactType(body.type),
      value: body.value as Fact["value"],
      locale: requiredLocale(body.locale),
      // `source: "aiSuggested"` is reserved for the sanctioned F-006 suggestion job, so
      // the transport always stamps `parentTyped` and never trusts a caller-supplied
      // source. The service keeps its own check for non-transport callers.
      source: "parentTyped",
      state: "suggested"
    });
    return c.json({ fact }, { status: 201 });
  });

  app.post("/api/facts/:id/confirm", requireSession, async (c) => {
    const fact = await hiding("fact", c.req.param("id"), () =>
      deps.facts.confirmFact({
        anonymousProjectId: c.get("session").anonymousProjectId,
        factId: c.req.param("id")
      })
    );
    return c.json({ fact });
  });

  app.post("/api/facts/:id/reject", requireSession, async (c) => {
    const fact = await hiding("fact", c.req.param("id"), () =>
      deps.facts.rejectFact({
        anonymousProjectId: c.get("session").anonymousProjectId,
        factId: c.req.param("id")
      })
    );
    return c.json({ fact });
  });

  app.delete("/api/facts/:id", requireSession, async (c) => {
    await hiding("fact", c.req.param("id"), () =>
      deps.facts.removeFact({ anonymousProjectId: c.get("session").anonymousProjectId, factId: c.req.param("id") })
    );
    return c.body(null, 204);
  });

  app.get("/api/facts/for-story", requireSession, async (c) => {
    const childProfileId = c.req.query("childProfileId");
    if (!childProfileId) throw new ValidationError("childProfileId is required");
    const facts = await hiding("child profile", childProfileId, () =>
      deps.facts.getFactsForStory({
        anonymousProjectId: c.get("session").anonymousProjectId,
        childProfileId
      })
    );
    return c.json({ facts });
  });

  // --- internal analytics (F-027 §8) ---------------------------------------
  app.post("/api/_internal/events", requireSession, async (c) => {
    const body = await readJson(c.req.raw);
    const batch = Array.isArray(body.events) ? body.events : null;
    if (!batch) throw new ValidationError("events must be an array");
    const rejected: Array<{ index: number; name: string; reason: string }> = [];
    const accepted: AnalyticsEvent[] = [];
    for (const [index, raw] of batch.entries()) {
      const event = raw as { name?: unknown; at?: unknown; attributes?: unknown };
      const name = typeof event.name === "string" ? event.name : "";
      if (!isAllowListedEvent(name)) {
        rejected.push({ index, name, reason: "event name is not on the F-027 §8 allow-list" });
        continue;
      }
      if (event.attributes !== undefined && (typeof event.attributes !== "object" || event.attributes === null || Array.isArray(event.attributes))) {
        rejected.push({ index, name, reason: "attributes must be an object" });
        continue;
      }
      accepted.push({
        name,
        at: typeof event.at === "string" ? event.at : deps.now(),
        attributes: (event.attributes as Record<string, string | number | boolean> | undefined) ?? {}
      });
    }
    for (const event of accepted) {
      await deps.events.push(event);
    }
    // Partial acceptance is reported, not hidden: the client can retry only the rejects.
    return c.json({ accepted: accepted.length, rejected }, { status: rejected.length > 0 ? 207 : 200 });
  });

  return app;
}

/** F-007 §8 + D024 §7: spend one budget unit, retire the old bundle, enqueue the next. */
async function regenerate(deps: ApiDeps, session: AnonymousSession, bookId: string) {
  const { conceptVersion, spent } = await hiding("book", bookId, () =>
    deps.books.regenerateConcepts({
      anonymousProjectId: session.anonymousProjectId,
      bookId
    })
  );
  const job = await deps.runner.requestBundle({ bookId, conceptVersion, anonymousProjectId: session.anonymousProjectId });
  return {
    status: "queued",
    conceptVersion,
    regenerationsUsed: spent,
    budgetRemaining: Math.max(0, REGENERATE_BUDGET_DEFAULT - spent),
    job: { status: job.status }
  };
}

function createSessionMiddleware(deps: ApiDeps) {
  return async (c: { req: { raw: Request }; get: (k: string) => unknown; set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    const found = await resolveOptional(deps, { req: { raw: c.req.raw } } as never);
    if (!found) throw new UnauthenticatedError("no valid flo_session cookie; POST /api/sessions/anonymous first");
    c.set("session", found.session);
    if (shouldRenew(found.session, Date.parse(deps.now()))) {
      await deps.sessions.touch(found.session.anonymousProjectId);
      setCookie(
        c as never,
        SESSION_COOKIE,
        found.rawToken,
        sessionCookieOptions(deps.secureCookies)
      );
    }
    await next();
  };
}

async function resolveOptional(deps: ApiDeps, c: { req: { raw: Request } }) {
  const rawToken = getCookie(c as never, SESSION_COOKIE);
  if (!rawToken) return null;
  try {
    const session = await deps.sessions.resolveSession(rawToken);
    return { session, rawToken };
  } catch {
    // A stale or forged cookie is indistinguishable from no cookie, and must not leak
    // which ids exist: both paths answer 401 on a protected route.
    return null;
  }
}

async function ownedProject(deps: ApiDeps, session: AnonymousSession): Promise<Project> {
  const project = await deps.sessionStore.getProjectByOwner(session.anonymousProjectId);
  if (!project) throw new UnauthenticatedError(`session ${session.anonymousProjectId} has no project`);
  return project;
}

/**
 * Ownership failures are reported as 404, never 403 (D024 §4 lists 403 for owner
 * violation, but a 403 on a *resource* id confirms the id is real, which turns the
 * endpoint into an enumeration oracle). 403 stays for requests where the caller's own
 * scope is at stake rather than a probed id.
 */
async function hiding<T>(what: string, id: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof OwnershipError) throw new ResourceNotFoundError(`${what} not found: ${id}`);
    throw err;
  }
}

async function loadOwnedBook(deps: ApiDeps, session: AnonymousSession, bookId: string) {
  return hiding("book", bookId, async () => {
    const book = await deps.creationStore.getBook(bookId);
    if (!book?.projectId) throw new ResourceNotFoundError(`book not found: ${bookId}`);
    await deps.sessions.assertCanAccessProject(session.anonymousProjectId, book.projectId);
    return book;
  });
}

async function nextConceptVersion(deps: ApiDeps, bookId: string): Promise<number> {
  const versions = await deps.creationStore.listConceptVersions(bookId);
  return versions.length === 0 ? 1 : Math.max(...versions) + 1;
}

async function readJson(raw: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await raw.json();
  } catch {
    throw new ValidationError("request body must be JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError("request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function requiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${field} is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(body: Record<string, unknown>, field: string): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string`);
  return value;
}

function optionalStringArray(body: Record<string, unknown>, field: string): string[] | undefined {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ValidationError(`${field} must be an array of strings`);
  }
  return value as string[];
}

/**
 * F-003 §12: the caller's affirmation. `grantedAt`/`recordedAt` are deliberately NOT
 * accepted from the client — `ChildProfileService` stamps them server-side, so a caller
 * cannot backdate when consent was given.
 */
function requiredAffirmation(value: unknown): ProfileConsent {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError("consent is required: {parentConfirmed: true, givenBy?}");
  }
  const consent = value as Record<string, unknown>;
  if (consent.parentConfirmed !== true) {
    throw new ValidationError("consent.parentConfirmed must be true: recorded parent consent gates profile storage (F-003 §12)");
  }
  return {
    parentConfirmed: true,
    ...(typeof consent.givenBy === "string" ? { givenBy: consent.givenBy } : {})
  };
}

function titlePitchPatch(body: Record<string, unknown>): { title?: string; pitch?: string } {
  const patch: { title?: string; pitch?: string } = {};
  const title = optionalString(body, "title");
  const pitch = optionalString(body, "pitch");
  if (title !== undefined) patch.title = title;
  if (pitch !== undefined) patch.pitch = pitch;
  if (patch.title === undefined && patch.pitch === undefined) {
    throw new ValidationError("supply title, pitch, or both");
  }
  return patch;
}

function requiredFactType(value: unknown): FactType {
  if (typeof value !== "string" || !(FACT_TYPES as readonly string[]).includes(value)) {
    throw new ValidationError(`type is required and must be one of: ${FACT_TYPES.join(", ")}`);
  }
  return value as FactType;
}

function requiredLocale(value: unknown): "en-GB" | "en-US" {
  if (typeof value !== "string" || !isLocale(value)) {
    throw new ValidationError(`locale is required and must be one of: en-GB, en-US`);
  }
  return value;
}

/** `exactOptionalPropertyTypes` means an explicitly-undefined key is not "absent". */
function compact<T extends object>(input: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

const PATCHABLE_PROFILE_FIELDS = [
  "name",
  "displayName",
  "dateOfBirth",
  "pronouns",
  "locale",
  "interests",
  "retentionClass",
  "status"
] as const;

function pickProfileFields(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const field of PATCHABLE_PROFILE_FIELDS) {
    if (body[field] !== undefined) patch[field] = body[field];
  }
  if (Object.keys(patch).length === 0) throw new ValidationError("no patchable profile fields supplied");
  return compact(patch) as Partial<ChildProfile>;
}
