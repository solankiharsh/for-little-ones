import { afterEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
vi.mock("ai", async (original) => ({ ...await original<typeof import("ai")>(), generateText: vi.fn() }));
import handler from "./correct-page";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("paid page correction API", () => {
  it("never calls a provider when the creation server denies paid access", async () => {
    vi.stubEnv("CREATION_API_URL", "https://creation.test");
    vi.stubEnv("VITE_MEDUSA_PUBLISHABLE_KEY", "pk_test");
    vi.stubEnv("CREATION_SERVICE_SECRET", "server-secret");
    const fetch = vi.fn().mockResolvedValue(Response.json({ message: "Complete payment to change pages." }, { status: 403 }));
    vi.stubGlobal("fetch", fetch);
    const response = await handler.fetch(new Request("https://site.test/api/correct-page", { method: "POST", body: JSON.stringify({ projectId: "project_1", revisionId: "revision_1", ownerToken: "ab".repeat(32), pageNumber: 3, intent: "SHORTER", idempotencyKey: "request-12345678" }) }));
    expect(response.status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ error: "Complete payment to change pages." });
  });
});

describe("correction request replay", () => {
  it("returns the persisted correction without enqueueing another attempt", async () => {
    vi.stubEnv("CREATION_API_URL", "https://creation.test"); vi.stubEnv("VITE_MEDUSA_PUBLISHABLE_KEY", "pk_test"); vi.stubEnv("CREATION_SERVICE_SECRET", "server-secret");
    const fetch = vi.fn().mockResolvedValue(Response.json({ status: "READY", text: "Milo held Mr Bear." })); vi.stubGlobal("fetch", fetch);
    const response = await handler.fetch(new Request("https://site.test/api/correct-page", { method: "POST", body: JSON.stringify({ projectId: "project_1", revisionId: "revision_1", ownerToken: "ab".repeat(32), pageNumber: 3, intent: "SHORTER", idempotencyKey: "request-12345678" }) }));
    expect(await response.json()).toEqual({ status: "READY", text: "Milo held Mr Bear." }); expect(fetch).toHaveBeenCalledTimes(1);
  });
});


describe("correction quality gate", () => {
  it("rejects a semantic fact contradiction before committing the generated words", async () => {
    vi.stubEnv("CREATION_API_URL", "https://creation.test"); vi.stubEnv("VITE_MEDUSA_PUBLISHABLE_KEY", "pk_test"); vi.stubEnv("CREATION_SERVICE_SECRET", "server-secret");
    vi.mocked(generateText).mockResolvedValueOnce({ output: { text: "Milo's rabbit is Mr Bear." }, usage: { inputTokens: 10, outputTokens: 8 } } as never)
      .mockResolvedValueOnce({ output: { safeForChildren: true, factsPreserved: false, continuityPreserved: true }, usage: { inputTokens: 12, outputTokens: 5 } } as never);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ status: "RUNNING", attemptToken: "attempt-1", context: { immutableFacts: { detail: "His teddy is Mr Bear" } } }))
      .mockResolvedValueOnce(Response.json({ status: "FAILED" })); vi.stubGlobal("fetch", fetch);
    const response = await handler.fetch(new Request("https://site.test/api/correct-page", { method: "POST", body: JSON.stringify({ projectId: "project_1", revisionId: "revision_1", ownerToken: "ab".repeat(32), pageNumber: 3, intent: "SHORTER", idempotencyKey: "request-12345678" }) }));
    expect(response.status).toBe(503);
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toMatchObject({ status: "FAILED", generationMetadata: { inputTokens: 22, outputTokens: 13 } });
  });
  it("saves a manual edit verbatim after quality checks, without rewriting it", async () => {
    vi.stubEnv("CREATION_API_URL", "https://creation.test"); vi.stubEnv("VITE_MEDUSA_PUBLISHABLE_KEY", "pk_test"); vi.stubEnv("CREATION_SERVICE_SECRET", "server-secret");
    vi.mocked(generateText).mockResolvedValueOnce({ output: { safeForChildren: true, factsPreserved: true, continuityPreserved: true }, usage: { inputTokens: 10, outputTokens: 5 } } as never);
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ status: "RUNNING", attemptToken: "attempt-1", context: {} })).mockResolvedValueOnce(Response.json({ status: "READY", text: "Milo held Mr Bear." })); vi.stubGlobal("fetch", fetch);
    const response = await handler.fetch(new Request("https://site.test/api/correct-page", { method: "POST", body: JSON.stringify({ projectId: "project_1", revisionId: "revision_1", ownerToken: "ab".repeat(32), pageNumber: 3, intent: "EDIT_TEXT", words: "Milo held Mr Bear.", idempotencyKey: "request-12345678" }) }));
    expect(response.status).toBe(200); expect(generateText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[1]![1].body)).toMatchObject({ status: "READY", text: "Milo held Mr Bear." });
  });
});
