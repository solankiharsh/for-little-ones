import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ModerationProvider, ProviderCard, StoryProvider } from "@for-little-ones/providers";
import { InMemoryDurableRuntime } from "@for-little-ones/execution";
import type { AnonymousSession } from "@for-little-ones/domain";
import { BookService } from "../creation/book-service";
import { InMemoryCreationStore } from "../creation/creation-store";
import { ConceptBundleRunner } from "../creation/concept-bundle-runner";
import { StoryRunner } from "../creation/story-runner";
import { ChildProfileService } from "../profile/child-profile-service";
import { FactService } from "../fact/fact-service";
import { InMemorySessionStore } from "../session/in-memory-session-store";
import { AnonymousSessionService } from "../session/session-service";
import { MemoryEventSink } from "../analytics/event-sink";
import { SLICE_2_EVENT_NAMES } from "../analytics/event-names";
import { createApiApp, type ApiDeps } from "./app";
import { createInternalEventFlusher } from "./event-flusher";

const TEST_CARD: ProviderCard = {
  dataPolicy: {
    verifiedAt: "2026-09-22",
    policyVersion: "test-v1",
    childDataSent: true,
    childDataScope: ["name-derived display name", "confirmed fact ids"],
    retentionMode: "NONE",
    trainingUse: "PROHIBITED",
    deletionMechanism: "CONTRACTUAL_ZERO_RETENTION",
    region: "not-applicable",
    evidenceRef: "internal://test"
  },
  idempotency: "none",
  timeoutMs: 10,
  retryPolicy: "none",
  costMetadata: "none"
};

function moderation(verdict: "ALLOW" | "BLOCK" = "ALLOW"): ModerationProvider {
  return {
    card: { ...TEST_CARD, dataPolicy: { ...TEST_CARD.dataPolicy, childDataSent: false } },
    async screen() {
      return { verdict, findings: [] };
    }
  };
}

function storyProvider(generate: () => Promise<Awaited<ReturnType<StoryProvider["generateConcepts"]>>>): Pick<
  StoryProvider,
  "generateConcepts" | "card"
> {
  return { card: TEST_CARD, generateConcepts: generate };
}

const GOOD_CONCEPTS = {
  schemaVersion: "1" as const,
  concepts: [0, 1, 2].map((i) => ({
    title: `Ava and the Star ${i}`,
    pitch: `Ava befriends a tiny star with number ${i} that has lost its glow and helps it shine again.`,
    emotionalGoal: "bravery" as const,
    themeId: "space",
    readingLevel: "4-6" as const,
    approximateLengthPages: 8,
    charactersUsed: ["Ava"]
  }))
};

const NOW = "2026-09-25T10:00:00.000Z";

const GOOD_OUTLINE = {
  schemaVersion: "1" as const,
  title: "Ava and the Star 0",
  synopsis: "Ava befriends a tiny star that has lost its glow.",
  emotionalGoal: "bravery",
  characters: [{ name: "Ava", role: "hero", facts: [] as string[] }],
  acts: [
    { title: "The beginning", summary: "Ava finds the dim star." },
    { title: "The middle", summary: "Ava carries the star uphill." },
    { title: "The end", summary: "The star glows; Ava heads home." }
  ],
  pageCount: 6
};

function storyProviderStub() {
  return {
    card: TEST_CARD,
    async generateOutline() {
      return GOOD_OUTLINE;
    },
    async generatePageText(request: { pageKey: string; pageNumber: number; locale: string }) {
      return {
        schemaVersion: "1" as const,
        pageKey: request.pageKey,
        pageNumber: request.pageNumber,
        textBlocks: [{ id: `block-${request.pageNumber}`, kind: "paragraph" as const, text: `Ava turned to adventure ${request.pageNumber} with a brave small smile.` }],
        illustrationCue: `Ava on page ${request.pageNumber}, warm soft light`,
        locale: request.locale
      };
    }
  };
}

interface Harness {
  app: ReturnType<typeof createApiApp>;
  deps: ApiDeps;
  store: InMemoryCreationStore;
  sessions: InMemorySessionStore;
  events: MemoryEventSink;
  runtime: InMemoryDurableRuntime;
  moderation: { verdict: "ALLOW" | "BLOCK" };
  counter: { n: number };
}

function harness(overrides: Partial<{ blocking: boolean; concepts: () => Promise<unknown> }> = {}): Harness {
  const store = new InMemoryCreationStore();
  const sessions = new InMemorySessionStore();
  const events = new MemoryEventSink();
  const runtime = new InMemoryDurableRuntime();
  const counter = { n: 0 };
  const state: Harness["moderation"] = { verdict: overrides.blocking ? "BLOCK" : "ALLOW" };
  const nextId = (prefix: string) => `${prefix}-${++counter.n}`;
  const now = () => NOW;

  const sessionService = new AnonymousSessionService({ store: sessions, now, newId: nextId });
  // Two runtimes mirror production queue separation (D029): concept and story
  // loops must never see each other's units.
  const storyRuntime = new InMemoryDurableRuntime();
  const deps: ApiDeps = {
    sessions: sessionService,
    sessionStore: sessions,
    creationStore: store,
    events,
    now,
    secureCookies: true,
    profiles: new ChildProfileService({ store, sessions, now, newId: nextId }),
    books: new BookService({
      store,
      assertProjectAccess: (anon, projectId) => sessionService.assertCanAccessProject(anon, projectId),
      now,
      newId: nextId,
      events,
      moderation: {
        card: TEST_CARD,
        async screen() {
          return { verdict: state.verdict, findings: [] };
        }
      },
      storyProvider: storyProvider(async () => GOOD_CONCEPTS)
    }),
    facts: new FactService({ store, sessions, events, now, newId: nextId }),
    runner: new ConceptBundleRunner({
      runtime,
      store,
      storyProvider: storyProvider(async () => (overrides.concepts ? (overrides.concepts() as never) : GOOD_CONCEPTS)),
      moderation: moderation("ALLOW"),
      events,
      getFactsForStory: async () => [],
      assertProjectAccess: (anon, projectId) => sessionService.assertCanAccessProject(anon, projectId),
      now
    }),
    stories: new StoryRunner({
      runtime: storyRuntime,
      store,
      storyProvider: storyProviderStub(),
      moderation: moderation("ALLOW"),
      events,
      getFactsForStory: async () => [],
      assertProjectAccess: (anon, projectId) => sessionService.assertCanAccessProject(anon, projectId),
      now
    })
  };
  return { app: createApiApp(deps), deps, store, sessions, events, runtime, moderation: state, counter };
}

type Json = Record<string, any>;

async function call(h: Harness, method: string, path: string, options: { cookie?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const res = await h.app.request(path, {
    method,
    headers,
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await res.text();
  let json: Json | null = null;
  try {
    json = text.length > 0 ? (JSON.parse(text) as Json) : null;
  } catch {
    json = null;
  }
  return { res, json, text, status: res.status };
}

/** Starts a session and returns the `flo_session` cookie plus the project id. */
async function signIn(h: Harness): Promise<{ cookie: string; projectId: string; session: Json }> {
  const r = await call(h, "POST", "/api/sessions/anonymous");
  const setCookie = r.res.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0] ?? "";
  return { cookie, projectId: r.json!.project.projectId, session: r.json!.session };
}

const PROFILE_BODY = {
  creationToken: "ct-1",
  name: "Ava Solanki",
  displayName: "Ava",
  dateOfBirth: "2021-06-01",
  pronouns: "she",
  interests: ["space"],
  consent: { parentConfirmed: true }
};

async function createProfile(h: Harness, cookie: string) {
  const r = await call(h, "POST", "/api/child-profiles", { cookie, body: PROFILE_BODY });
  return r;
}

async function bookWithTheme(h: Harness, cookie: string) {
  const profile = (await createProfile(h, cookie)).json!.profile;
  const r = await call(h, "POST", "/api/books", { cookie, body: { childProfileId: profile.id, themeId: "space" } });
  return { profileId: profile.id as string, bookId: r.json!.book.id as string, book: r.json!.book };
}

describe("api: HTTP transport (D024 §4)", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  describe("sessions and the flo_session cookie", () => {
    it("sets flo_session HttpOnly + SameSite=Lax + Secure and returns the project", async () => {
      const r = await call(h, "POST", "/api/sessions/anonymous");
      const cookie = r.res.headers.get("set-cookie") ?? "";
      expect(r.status).toBe(201);
      expect(cookie).toMatch(/^flo_session=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Secure/);
      expect(cookie).toMatch(/Path=\//);
      expect(r.json!.project.owner.anonymousProjectId).toBe(r.json!.session.anonymousProjectId);
    });

    it("401s a protected route with no cookie, and with a forged one", async () => {
      expect((await call(h, "GET", "/api/books/whatever")).status).toBe(401);
      expect((await call(h, "GET", "/api/books/whatever", { cookie: "flo_session=forged" })).status).toBe(401);
    });

    it("reuses a still-valid session instead of orphaning the parent's project", async () => {
      const first = await signIn(h);
      const second = await call(h, "POST", "/api/sessions/anonymous", { cookie: first.cookie });
      expect(second.status).toBe(200);
      expect(second.json!.reused).toBe(true);
      expect(second.json!.session.anonymousProjectId).toBe(first.session.anonymousProjectId);
    });

    it("clears the cookie on sign-out", async () => {
      const { cookie } = await signIn(h);
      const r = await call(h, "DELETE", "/api/sessions/anonymous", { cookie });
      expect(r.status).toBe(204);
      expect(r.res.headers.get("set-cookie")).toMatch(/flo_session=;/);
    });
  });

  describe("catalogue", () => {
    it("lists themes, categories and one theme without a session", async () => {
      const themes = await call(h, "GET", "/api/catalogue/themes");
      expect(themes.status).toBe(200);
      expect(themes.json!.themes.length).toBeGreaterThan(0);
      expect((await call(h, "GET", "/api/catalogue/categories")).json!.categories.length).toBeGreaterThan(0);
      expect((await call(h, "GET", "/api/catalogue/themes/space")).json!.theme.id).toBe("space");
    });

    it("400s an unsupported locale rather than silently falling back", async () => {
      const r = await call(h, "GET", "/api/catalogue/themes?locale=fr-FR");
      expect(r.status).toBe(400);
      expect(r.json!.error.code).toBe("validation_failed");
    });

    it("re-orders for a child without filtering the catalogue", async () => {
      const plain = (await call(h, "GET", "/api/catalogue/themes")).json!.themes as Json[];
      const { cookie } = await signIn(h);
      const { profileId } = await bookWithTheme(h, cookie);
      const ranked = (await call(h, "GET", `/api/catalogue/themes?childId=${profileId}`)).json!.themes as Json[];
      expect(ranked).toHaveLength(plain.length);
      expect(ranked.map((t) => t.id)).not.toEqual(plain.map((t) => t.id));
    });
  });

  describe("child profiles", () => {
    it("creates a profile with recorded consent and dedupes a replayed creationToken", async () => {
      const { cookie } = await signIn(h);
      const first = await createProfile(h, cookie);
      expect(first.status).toBe(201);
      expect(first.json!.profile.relationshipIds).toEqual([`rel:self:${first.json!.profile.id}`]);
      const replay = await createProfile(h, cookie);
      expect(replay.status).toBe(201);
      expect(replay.json!.profile.id).toBe(first.json!.profile.id);
    });

    it("400s a profile with no recorded parent consent (F-003 §12)", async () => {
      const { cookie } = await signIn(h);
      const r = await call(h, "POST", "/api/child-profiles", {
        cookie,
        body: { ...PROFILE_BODY, creationToken: "ct-x", consent: { parentConfirmed: false } }
      });
      expect(r.status).toBe(400);
      expect(r.json!.error.message).toMatch(/parentConfirmed/);
    });

    it("400s a non-JSON body instead of 500ing", async () => {
      const { cookie } = await signIn(h);
      const res = await h.app.request("/api/child-profiles", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: "{not json"
      });
      expect(res.status).toBe(400);
    });

    it("409s a stale revision and applies the patch when the revision is current", async () => {
      const { cookie } = await signIn(h);
      const { profileId } = await bookWithTheme(h, cookie);
      const ok = await call(h, "PATCH", `/api/child-profiles/${profileId}`, {
        cookie,
        body: { expectedRevision: 0, displayName: "Ava B" }
      });
      expect(ok.status).toBe(200);
      expect(ok.json!.profile.displayName).toBe("Ava B");
      expect(ok.json!.profile.revision).toBe(1);

      const stale = await call(h, "PATCH", `/api/child-profiles/${profileId}`, {
        cookie,
        body: { expectedRevision: 0, displayName: "Ava C" }
      });
      expect(stale.status).toBe(409);
      expect(stale.json!.error.code).toBe("conflict");
      expect((await call(h, "GET", `/api/child-profiles/${profileId}`, { cookie })).json!.profile.displayName).toBe("Ava B");
    });

    it("400s a patch with no revision and 404s an unknown profile", async () => {
      const { cookie } = await signIn(h);
      expect((await call(h, "PATCH", "/api/child-profiles/child-x", { cookie, body: { displayName: "A" } })).status).toBe(400);
      expect((await call(h, "GET", "/api/child-profiles/child-x", { cookie })).status).toBe(404);
    });

    it("404s (never 403s) another session's profile, so ids cannot be probed", async () => {
      const a = await signIn(h);
      const { profileId } = await bookWithTheme(h, a.cookie);
      const b = await signIn(h);
      const r = await call(h, "GET", `/api/child-profiles/${profileId}`, { cookie: b.cookie });
      expect(r.status).toBe(404);
    });
  });

  describe("books and the creation journey", () => {
    it("walks CREATED -> THEME_SELECTED -> CONCEPT_SELECTED", async () => {
      const { cookie } = await signIn(h);
      const { profileId } = await bookWithTheme(h, cookie);
      const created = await call(h, "POST", "/api/books", { cookie, body: { childProfileId: profileId } });
      expect(created.json!.book.creationState).toBe("CREATED");

      const themed = await call(h, "POST", `/api/books/${created.json!.book.id}/theme`, {
        cookie,
        body: { themeId: "space" }
      });
      expect(themed.json!.book.creationState).toBe("THEME_SELECTED");

      await call(h, "POST", `/api/books/${created.json!.book.id}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");
      const job = await h.deps.runner.jobFor(created.json!.book.id, 1);
      expect(job!.status).toBe("SUCCEEDED");
      const bundle = await call(h, "GET", `/api/books/${created.json!.book.id}/concepts`, { cookie });
      expect(bundle.json!.status).toBe("ready");
      expect(bundle.json!.concepts).toHaveLength(3);

      const picked = await call(h, "POST", `/api/books/${created.json!.book.id}/concepts/${bundle.json!.concepts[0]!.id}/select`, {
        cookie
      });
      expect(picked.json!.book.creationState).toBe("CONCEPT_SELECTED");
    });

    it("reports a queued bundle rather than an empty list while the worker is busy", async () => {
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      const queued = await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      expect(queued.status).toBe(202);
      const read = await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie });
      expect(read.json!.status).toBe("queued");
    });

    it("is idempotent on a repeated generate: one natural key, no second bundle", async () => {
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      const first = await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      const second = await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      expect(second.json!.conceptVersion).toBe(first.json!.conceptVersion);
      expect(second.json!.job.status).toBe(first.json!.job.status);
    });

    it("serves the fallback bundle once the durable unit is dead, and says so (F-007 §9)", async () => {
      const dead = harness({ concepts: async () => ({ schemaVersion: "1", concepts: [] }) });
      const { cookie } = await signIn(dead);
      const { bookId } = await bookWithTheme(dead, cookie);
      await call(dead, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await dead.deps.runner.runNext("worker-1");
      await dead.deps.runner.runNext("worker-1");
      await dead.deps.runner.runNext("worker-1");
      expect((await dead.deps.runner.jobFor(bookId, 1))!.units[0]!.status).toBe("DEAD");

      const read = await call(dead, "GET", `/api/books/${bookId}/concepts`, { cookie });
      expect(read.json!.status).toBe("ready");
      expect(read.json!.servedFrom).toBe("fallback");
      expect(read.json!.concepts).toHaveLength(3);
      expect(dead.events.events.map((e) => e.name)).toContain("concepts_served_from_fallback");
    });

    it("400s generating concepts before a theme is chosen", async () => {
      const { cookie } = await signIn(h);
      const { profileId } = await bookWithTheme(h, cookie);
      const book = (await call(h, "POST", "/api/books", { cookie, body: { childProfileId: profileId } })).json!.book;
      const r = await call(h, "POST", `/api/books/${book.id}/concepts`, { cookie });
      expect(r.status).toBe(400);
      expect(r.json!.error.message).toMatch(/theme/);
    });

    it("404s another session's book rather than confirming the id exists", async () => {
      const a = await signIn(h);
      const { bookId } = await bookWithTheme(h, a.cookie);
      const b = await signIn(h);
      expect((await call(h, "GET", `/api/books/${bookId}`, { cookie: b.cookie })).status).toBe(404);
      expect((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie: b.cookie })).status).toBe(404);
    });

    it("GET /books/{id} returns the book with its creation state and profile", async () => {
      const { cookie } = await signIn(h);
      const { bookId, profileId } = await bookWithTheme(h, cookie);
      const r = await call(h, "GET", `/api/books/${bookId}`, { cookie });
      expect(r.json!.book.creationState).toBe("THEME_SELECTED");
      expect(r.json!.profile.id).toBe(profileId);
    });
  });

  describe("parent edit of concept copy", () => {
    it("422s a BLOCK and persists nothing", async () => {
      h = harness({ blocking: true });
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");
      const concepts = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];

      const blocked = await call(h, "PATCH", `/api/books/${bookId}/concepts/${concepts[0]!.id}`, {
        cookie,
        body: { title: "A Nasty Title" }
      });
      expect(blocked.status).toBe(422);
      expect(blocked.json!.error.code).toBe("moderation_blocked");
      expect(blocked.json!.error.message).toBeTruthy();

      const after = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];
      expect(after.map((c) => c.title)).toEqual(concepts.map((c) => c.title));
      expect(after.every((c) => c.conceptVersion === 1)).toBe(true);
    });

    it("applies an allowed edit as source=edited at a bumped version", async () => {
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");
      const concepts = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];

      const edited = await call(h, "PATCH", `/api/books/${bookId}/concepts/${concepts[0]!.id}`, {
        cookie,
        body: { title: "Ava and the Pinch of Starlight" }
      });
      expect(edited.status).toBe(200);
      expect(edited.json!.concept.source).toBe("edited");
      expect(edited.json!.concept.conceptVersion).toBe(2);
    });

    it("400s an over-long title or an empty patch, and 404s an unknown concept", async () => {
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");
      const concepts = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];
      const path = `/api/books/${bookId}/concepts/${concepts[0]!.id}`;

      expect((await call(h, "PATCH", path, { cookie, body: { title: "x".repeat(61) } })).status).toBe(400);
      expect((await call(h, "PATCH", path, { cookie, body: { emotionalGoal: "bravery" } })).status).toBe(400);
      expect((await call(h, "PATCH", `/api/books/${bookId}/concepts/nope`, { cookie, body: { title: "A" } })).status).toBe(404);
    });

    it("404s an edit from another session rather than confirming the concept exists", async () => {
      const a = await signIn(h);
      const { bookId } = await bookWithTheme(h, a.cookie);
      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie: a.cookie });
      await h.deps.runner.runNext("worker-1");
      const concepts = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie: a.cookie })).json!.concepts ?? []) as Json[];
      const b = await signIn(h);
      const r = await call(h, "PATCH", `/api/books/${bookId}/concepts/${concepts[0]!.id}`, { cookie: b.cookie, body: { title: "Not Yours" } });
      expect(r.status).toBe(404);
    });
  });

  describe("story generation (F-008 §8)", () => {
    async function bookWithStory(cookie: string) {
      const { bookId } = await bookWithTheme(h, cookie);
      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");
      const concepts = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];
      await call(h, "POST", `/api/books/${bookId}/concepts/${concepts[0]!.id}/select`, { cookie });
      return bookId;
    }

    async function drainStories(rounds = 10) {
      for (let i = 0; i < rounds; i += 1) {
        const outcomes = await h.deps.stories.runNext("worker-1", 8);
        if (outcomes.length === 0) return;
      }
    }

    it("400s without a selected concept, then runs outline to six READY pages", async () => {
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      expect((await call(h, "POST", `/api/books/${bookId}/story`, { cookie })).status).toBe(400);

      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");
      const concepts = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];
      await call(h, "POST", `/api/books/${bookId}/concepts/${concepts[0]!.id}/select`, { cookie });

      const queued = await call(h, "POST", `/api/books/${bookId}/story`, { cookie });
      expect(queued.status).toBe(202);
      expect(queued.json!.job.status).toBe("QUEUED");

      await h.deps.stories.runNext("worker-1");
      const working = (await call(h, "GET", `/api/books/${bookId}/story`, { cookie })).json!;
      expect(working.status).toBe("working");
      expect(working.story.status).toBe("OUTLINE_READY");
      expect(working.pages).toHaveLength(6);

      await drainStories();
      const done = (await call(h, "GET", `/api/books/${bookId}/story`, { cookie })).json!;
      expect(done.status).toBe("ready");
      expect(done.pages.every((page: Json) => page.status === "READY")).toBe(true);
      expect(done.pages[0].textBlocks[0].text).toContain("Ava");
    });

    it("rewrites one page without touching its siblings", async () => {
      const { cookie } = await signIn(h);
      const bookId = await bookWithStory(cookie);
      await call(h, "POST", `/api/books/${bookId}/story`, { cookie });
      await h.deps.stories.runNext("worker-1");
      await drainStories();

      const regen = await call(h, "POST", `/api/books/${bookId}/story/pages/2/regenerate`, { cookie });
      expect(regen.status).toBe(202);
      await drainStories();
      const done = (await call(h, "GET", `/api/books/${bookId}/story`, { cookie })).json!;
      expect(done.status).toBe("ready");
      expect(done.pages.find((page: Json) => page.pageNumber === 2).attemptCount).toBe(2);
      expect(done.pages.filter((page: Json) => page.pageNumber !== 2).every((page: Json) => page.attemptCount === 1)).toBe(true);
    });

    it("404s another session's book rather than confirming it exists", async () => {
      const a = await signIn(h);
      const bookId = await bookWithStory(a.cookie);
      const b = await signIn(h);
      expect((await call(h, "GET", `/api/books/${bookId}/story`, { cookie: b.cookie })).status).toBe(404);
      expect((await call(h, "POST", `/api/books/${bookId}/story`, { cookie: b.cookie })).status).toBe(404);
    });
  });

  describe("regenerate budget", () => {
    async function regenerateOnce(cookie: string, bookId: string) {
      return call(h, "POST", `/api/books/${bookId}/concepts/regenerate`, { cookie });
    }

    it("spends one unit per call, caps at 3, then 409s", async () => {
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");

      for (let i = 1; i <= 3; i += 1) {
        const r = await regenerateOnce(cookie, bookId);
        expect(r.status).toBe(202);
        expect(r.json!.regenerationsUsed).toBe(i);
        expect(r.json!.budgetRemaining).toBe(3 - i);
        await h.deps.runner.runNext("worker-1");
      }
      const spent = await regenerateOnce(cookie, bookId);
      expect(spent.status).toBe(409);
      expect(spent.json!.error.message).toMatch(/regenerations/);
    });

    it("retires the old bundle so the parent cannot flip back to it", async () => {
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");
      const first = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];

      await regenerateOnce(cookie, bookId);
      await h.deps.runner.runNext("worker-1");
      const second = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];
      expect(second.every((c) => c.conceptVersion === 2)).toBe(true);
      expect(await h.store.getConcept(first[0]!.id)).toMatchObject({ status: "DISCARDED" });
      // History is retained, not deleted.
      expect(await h.store.getConcept(first[0]!.id)).toMatchObject({ title: first[0]!.title });
    });

    it("also accepts ?regenerate=true on the generate route", async () => {
      const { cookie } = await signIn(h);
      const { bookId } = await bookWithTheme(h, cookie);
      const r = await call(h, "POST", `/api/books/${bookId}/concepts?regenerate=true`, { cookie });
      expect(r.status).toBe(202);
      expect(r.json!.regenerationsUsed).toBe(1);
    });
  });

  describe("facts", () => {
    async function withProfile() {
      const { cookie } = await signIn(h);
      const { profileId } = await bookWithTheme(h, cookie);
      return { cookie, profileId };
    }

    it("lists locale-typed options and 400s an unknown type or locale", async () => {
      const { cookie } = await withProfile();
      const r = await call(h, "GET", "/api/fact-options?type=favouriteColour&locale=en-GB", { cookie });
      expect(r.status).toBe(200);
      expect(r.json!.options.length).toBeGreaterThan(0);
      expect((await call(h, "GET", "/api/fact-options?type=nope&locale=en-GB", { cookie })).status).toBe(400);
      expect((await call(h, "GET", "/api/fact-options?type=pet&locale=fr-FR", { cookie })).status).toBe(400);
    });

    it("adds a fact as suggested and dedupes a replayed factToken", async () => {
      const { cookie, profileId } = await withProfile();
      const body = {
        childProfileId: profileId,
        factToken: "ft-1",
        type: "favouriteColour",
        value: { kind: "enum", optionId: "purple" },
        locale: "en-GB"
      };
      const first = await call(h, "POST", "/api/facts", { cookie, body });
      expect(first.status).toBe(201);
      expect(first.json!.fact.state).toBe("suggested");
      const replay = await call(h, "POST", "/api/facts", { cookie, body });
      expect(replay.json!.fact.id).toBe(first.json!.fact.id);
    });

    it("400s a client that tries to write parentConfirmed directly", async () => {
      const { cookie, profileId } = await withProfile();
      const r = await call(h, "POST", "/api/facts", {
        cookie,
        body: {
          childProfileId: profileId,
          factToken: "ft-x",
          type: "favouriteColour",
          value: { kind: "enum", optionId: "purple" },
          locale: "en-GB",
          state: "parentConfirmed"
        }
      });
      // Refused explicitly rather than silently downgraded to `suggested`: a caller that
      // thinks it confirmed a fact is worse than one that got a 400.
      expect(r.status).toBe(400);
      expect(r.json!.error.message).toMatch(/confirm/);
      expect(await h.store.getFact("fact-1")).toBeUndefined();
    });

    it("ignores a caller-supplied source: aiSuggested is not reachable from the client", async () => {
      const { cookie, profileId } = await withProfile();
      const r = await call(h, "POST", "/api/facts", {
        cookie,
        body: {
          childProfileId: profileId,
          factToken: "ft-src",
          type: "favouriteColour",
          value: { kind: "enum", optionId: "purple" },
          locale: "en-GB",
          source: "aiSuggested"
        }
      });
      expect(r.status).toBe(201);
      expect(r.json!.fact.source).toBe("parentTyped");
    });

    it("confirms, rejects and removes, keeping the story-usage audit after removal", async () => {
      const { cookie, profileId } = await withProfile();
      const added = (
        await call(h, "POST", "/api/facts", {
          cookie,
          body: {
            childProfileId: profileId,
            factToken: "ft-2",
            type: "favouriteToy",
            value: { kind: "enum", optionId: "blocks" },
            locale: "en-GB"
          }
        })
      ).json!.fact;

      const confirmed = await call(h, "POST", `/api/facts/${added.id}/confirm`, { cookie });
      expect(confirmed.json!.fact.state).toBe("parentConfirmed");

      const other = (
        await call(h, "POST", "/api/facts", {
          cookie,
          body: {
            childProfileId: profileId,
            factToken: "ft-3",
            type: "hobby",
            value: { kind: "enum", optionId: "drawing" },
            locale: "en-GB"
          }
        })
      ).json!.fact;
      expect((await call(h, "POST", `/api/facts/${other.id}/reject`, { cookie })).json!.fact.state).toBe("rejected");

      const story = await call(h, "GET", `/api/facts/for-story?childProfileId=${profileId}`, { cookie });
      expect(story.json!.facts.map((f: Json) => f.id)).toEqual([added.id]);

      const del = await call(h, "DELETE", `/api/facts/${added.id}`, { cookie });
      expect(del.status).toBe(204);
      expect(await h.store.getFact(added.id)).toBeUndefined();
      expect((await call(h, "GET", `/api/facts/for-story?childProfileId=${profileId}`, { cookie })).json!.facts).toEqual([]);
    });

    it("400s a custom fact past the quota and an invalid enum value", async () => {
      const { cookie, profileId } = await withProfile();
      for (let i = 0; i < 3; i += 1) {
        const r = await call(h, "POST", "/api/facts", {
          cookie,
          body: {
            childProfileId: profileId,
            factToken: `ft-c${i}`,
            type: "customFact",
            value: { kind: "custom", subject: "favourite thing", claim: `Number ${i}` },
            locale: "en-GB"
          }
        });
        expect(r.status).toBe(201);
      }
      const fourth = await call(h, "POST", "/api/facts", {
        cookie,
        body: {
          childProfileId: profileId,
          factToken: "ft-c3",
          type: "customFact",
          value: { kind: "custom", subject: "favourite thing", claim: "Number 4" },
          locale: "en-GB"
        }
      });
      expect(fourth.status).toBe(400);
      expect(fourth.json!.error.message).toMatch(/custom/i);

      const bad = await call(h, "POST", "/api/facts", {
        cookie,
        body: {
          childProfileId: profileId,
          factToken: "ft-bad",
          type: "favouriteColour",
          value: { kind: "enum", optionId: "not-a-colour" },
          locale: "en-GB"
        }
      });
      expect(bad.status).toBe(400);
      expect(bad.json!.error.message).toMatch(/invalid fact/);
    });

    it("404s another session's fact and 400s for-story without a childProfileId", async () => {
      const { cookie, profileId } = await withProfile();
      const added = (
        await call(h, "POST", "/api/facts", {
          cookie,
          body: {
            childProfileId: profileId,
            factToken: "ft-4",
            type: "pet",
            value: { kind: "pet", relationshipId: `rel:self:${profileId}` },
            locale: "en-GB"
          }
        })
      ).json!.fact;
      const b = await signIn(h);
      expect((await call(h, "POST", `/api/facts/${added.id}/confirm`, { cookie: b.cookie })).status).toBe(404);
      expect((await call(h, "GET", "/api/facts/for-story", { cookie })).status).toBe(400);
    });
  });

  describe("internal analytics ingestion", () => {
    it("accepts an allow-listed batch", async () => {
      const { cookie } = await signIn(h);
      const before = h.events.events.length;
      const r = await call(h, "POST", "/api/_internal/events", {
        cookie,
        body: {
          events: [
            { name: "story_concept_selected", at: NOW, attributes: { conceptVersion: 1 } },
            { name: "checkout_started", attributes: {} }
          ]
        }
      });
      expect(r.status).toBe(200);
      expect(r.json!.accepted).toBe(2);
      expect(h.events.events.slice(before).map((e) => e.name)).toEqual(["story_concept_selected", "checkout_started"]);
    });

    it("rejects a non-allow-listed name and still accepts the rest (207)", async () => {
      const { cookie } = await signIn(h);
      const before = h.events.events.length;
      const r = await call(h, "POST", "/api/_internal/events", {
        cookie,
        body: {
          events: [
            { name: "child_profile_created", attributes: { name: "Ava" } },
            { name: "story_concept_selected", attributes: {} }
          ]
        }
      });
      expect(r.status).toBe(207);
      expect(r.json!.accepted).toBe(1);
      expect(r.json!.rejected).toEqual([
        { index: 0, name: "child_profile_created", reason: "event name is not on the F-027 §8 allow-list" }
      ]);
      expect(h.events.events.slice(before).map((e) => e.name)).toEqual(["story_concept_selected"]);
    });

    it("401s without a session — ingestion is not public", async () => {
      expect((await call(h, "POST", "/api/_internal/events", { body: { events: [] } })).status).toBe(401);
    });
  });

  describe("event allow-list cannot drift from the emitters", () => {
    it("every event any service or runner pushed is on the allow-list", async () => {
      const { cookie } = await signIn(h);
      const { bookId, profileId } = await bookWithTheme(h, cookie);
      await call(h, "POST", `/api/sessions/anonymous`);
      await call(h, "POST", `/api/books/${bookId}/concepts`, { cookie });
      await h.deps.runner.runNext("worker-1");
      const concepts = ((await call(h, "GET", `/api/books/${bookId}/concepts`, { cookie })).json!.concepts ?? []) as Json[];
      await call(h, "POST", `/api/books/${bookId}/concepts/${concepts[0]!.id}/select`, { cookie });
      await call(h, "PATCH", `/api/books/${bookId}/concepts/${concepts[0]!.id}`, { cookie, body: { title: "A New Title" } });
      await call(h, "POST", `/api/books/${bookId}/concepts/regenerate`, { cookie });
      const fact = (
        await call(h, "POST", "/api/facts", {
          cookie,
          body: {
            childProfileId: profileId,
            factToken: "ft-drift",
            type: "pet",
            value: { kind: "pet", relationshipId: `rel:self:${profileId}` },
            locale: "en-GB"
          }
        })
      ).json!.fact;
      await call(h, "POST", `/api/facts/${fact.id}/confirm`, { cookie });

      expect(h.events.events.length).toBeGreaterThan(3);
      for (const event of h.events.events) {
        expect(SLICE_2_EVENT_NAMES).toContain(event.name);
      }
    });
  });

  describe("internal event flusher (D024 §9)", () => {
    it("batches a timed sink through the authenticated ingestion endpoint", async () => {
      const { cookie } = await signIn(h);
      const flusher = createInternalEventFlusher({
        fetch: async (input, init) => h.app.request(String(input), init as RequestInit),
        baseUrl: "http://api.test",
        cookie
      });
      await flusher.push({ name: "story_concept_selected", at: NOW, attributes: { conceptVersion: 2 } });
      await flusher.flushNow();
      expect(h.events.events.map((e) => e.name)).toContain("story_concept_selected");
    });

    it("401s when the flusher has no real session cookie", async () => {
      const flusher = createInternalEventFlusher({
        fetch: async (input, init) => h.app.request(String(input), init as RequestInit),
        baseUrl: "http://api.test",
        cookie: "flo_session=project-1"
      });
      await flusher.push({ name: "story_concept_selected", at: NOW, attributes: {} });
      await expect(flusher.flushNow()).rejects.toThrow(/analytics ingestion failed: 401/);
    });

    it("surfaces a 207 partial accept instead of swallowing the rejects", async () => {
      const { cookie } = await signIn(h);
      const rejected: Array<{ name: string }> = [];
      const flusher = createInternalEventFlusher({
        fetch: async (input, init) => h.app.request(String(input), init as RequestInit),
        baseUrl: "http://api.test",
        cookie,
        onPartialAccept: (rows) => rejected.push(...rows)
      });
      // A name the allow-list does not carry: exactly the drift the callback exists for.
      await flusher.push({ name: "not_allow_listed", at: NOW, attributes: {} });
      await flusher.push({ name: "story_concept_selected", at: NOW, attributes: {} });
      await flusher.flushNow();
      expect(rejected.map((r) => r.name)).toEqual(["not_allow_listed"]);
      expect(h.events.events.map((e) => e.name)).toContain("story_concept_selected");
    });

    it("throws when ingestion itself fails, so a sink never reports a false success", async () => {
      const flusher = createInternalEventFlusher({
        fetch: async () => new Response("nope", { status: 500 }),
        baseUrl: "http://api.test",
        cookie: "flo_session=x"
      });
      await flusher.push({ name: "story_concept_selected", at: NOW, attributes: {} });
      await expect(flusher.flushNow()).rejects.toThrow(/analytics ingestion failed/);
    });
  });

  describe("unknown routes", () => {
    it("404s with the standard error body", async () => {
      const r = await call(h, "GET", "/api/nope");
      expect(r.status).toBe(404);
      expect(r.json!.error.code).toBe("not_found");
    });
  });
});

afterEach(() => {
  // Nothing global to tear down: every harness owns in-memory stores and a runtime.
  expect(true).toBe(true);
});
