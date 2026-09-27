import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ExampleVendorStoryProvider } from "@for-little-ones/providers";
import { composeApi, type ComposedApi } from "./compose";
import { devModerationProvider } from "./dev-providers";
import { clearExecutionLedger, resetFloTables } from "./persistence/test-database";
import { createPool } from "./persistence/postgres-stores";
import { testDatabaseUrl } from "./persistence/test-database";

/**
 * Covers the composition root — the one piece every other spec deliberately bypasses by
 * injecting fakes. Without this, the production wiring (one shared `pg.Pool`, Postgres
 * stores behind the real services, the durable runtime on a real queue) is only ever
 * exercised by `app.request()` against in-memory doubles, so a wiring mistake here would
 * ship green.
 *
 * `composeApi` memoizes its pool process-wide, so this file composes once and shares it.
 */
/** `creationToken` is the business idempotency key, so it has to be fresh per profile. */
function profileBody(n: number) {
  return {
  creationToken: `ct-compose-${n}`,
  name: "Ava Solanki",
  displayName: "Ava",
  dateOfBirth: "2021-06-01",
  pronouns: "she",
  interests: ["space"],
  consent: { parentConfirmed: true }
  };
}

describe("composition root (D024 §3: Postgres tier over the command/query boundary)", () => {
  let composed: ComposedApi;
  let counter = 0;

  async function startSession(): Promise<{ jar: string; authed: Record<string, string> }> {
    const started = await composed.app.request("/api/sessions/anonymous", { method: "POST" });
    expect(started.status).toBe(201);
    const cookie = started.headers.get("set-cookie");
    const jar = cookie!.split(";")[0]!;
    return { jar, authed: { cookie: jar, "content-type": "application/json" } };
  }

  async function bookWithTheme(authed: Record<string, string>): Promise<string> {
    const profile = await composed.app.request("/api/child-profiles", {
      method: "POST",
      headers: authed,
      body: JSON.stringify(profileBody(++counter))
    });
    expect(profile.status).toBe(201);
    const { profile: created } = (await profile.json()) as { profile: { id: string } };

    const book = await composed.app.request("/api/books", {
      method: "POST",
      headers: authed,
      body: JSON.stringify({ childProfileId: created.id, themeId: "space", title: `Ava and the Star ${++counter}` })
    });
    expect(book.status).toBe(201);
    const { book: made } = (await book.json()) as { book: { id: string } };
    return made.id;
  }

  beforeAll(async () => {
    await resetFloTables();
    composed = await composeApi({
      connectionString: testDatabaseUrl(),
      providers: { story: new ExampleVendorStoryProvider(), moderation: devModerationProvider() }
    });
    // pg-boss creates its schema on runtime init, so this must come after compose.
    const pool = createPool(testDatabaseUrl());
    await clearExecutionLedger(pool);
    await pool.end();
  });

  afterAll(async () => {
    await composed?.close();
  });

  it("serves the anonymous flow end to end over Postgres", async () => {
    const { authed } = await startSession();

    const profile = await composed.app.request("/api/child-profiles", {
      method: "POST",
      headers: authed,
      body: JSON.stringify(profileBody(++counter))
    });
    expect(profile.status).toBe(201);
    const { profile: created } = (await profile.json()) as { profile: { id: string; displayName: string } };
    expect(created.displayName).toBe("Ava");

    const book = await composed.app.request("/api/books", {
      method: "POST",
      headers: authed,
      body: JSON.stringify({ childProfileId: created.id, themeId: "space" })
    });
    expect(book.status).toBe(201);
    const { book: made } = (await book.json()) as { book: { id: string; creationState: string } };
    expect(made.creationState).toBe("THEME_SELECTED");

    // The book must be in Postgres, not in a per-request object: read it back through the
    // store rather than trusting the response we just produced.
    const reread = await composed.deps.creationStore.getBook(made.id);
    expect(reread?.themeId).toBe("space");
    expect(reread?.creationState).toBe("THEME_SELECTED");
  });

  it("sets a session cookie a browser can keep and a script cannot read", async () => {
    const started = await composed.app.request("/api/sessions/anonymous", { method: "POST" });
    const cookie = started.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^flo_session=/u);
    // D024 §2: HttpOnly + SameSite=Lax, and never the raw token in the body.
    expect(cookie).toMatch(/HttpOnly/u);
    expect(cookie).toMatch(/SameSite=Lax/u);
    const body = (await started.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toMatch(new RegExp(cookie.match(/flo_session=([^;]+)/u)![1]!, "u"));
  });

  it("refuses another session's book (ownership is enforced, not assumed)", async () => {
    const { authed } = await startSession();
    const bookId = await bookWithTheme(authed);
    const other = await startSession();

    const res = await composed.app.request(`/api/books/${bookId}`, { headers: { cookie: other.jar } });
    // 404, not 403: a foreign book must be indistinguishable from a missing one.
    expect(res.status).toBe(404);
  });

  it("enqueues a real durable unit carrying the owning session", async () => {
    const { authed } = await startSession();
    const bookId = await bookWithTheme(authed);

    const res = await composed.app.request(`/api/books/${bookId}/concepts`, { method: "POST", headers: authed });
    expect(res.status).toBe(202);

    const job = await composed.runtime.job(composed.deps.runner.operationKey(bookId, 1));
    expect(job?.status).toBe("QUEUED");
    expect(job?.units).toHaveLength(1);

    // The payload is what a worker months from now will act on, so the owning session
    // has to travel with it — enqueue-time authorisation alone is not enough.
    const payload = job!.units[0]!.payload as { bookId: string; anonymousProjectId: string };
    expect(payload.bookId).toBe(bookId);
    expect(payload.anonymousProjectId).toMatch(/^anon-/u);
  });
});
