import { afterEach, describe, expect, it, vi } from "vitest";
import { changeStoryPage, undoStoryPage, loadStoryProject } from "./story-preview";
const project = { projectId: "project_1", revisionId: "revision_1", ownerToken: "ab".repeat(32), entitlement: "PAID" as const };
afterEach(() => vi.unstubAllGlobals());

describe("browser page correction flow", () => {
  it("keeps the request key when retrying after a lost response", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValueOnce(Response.json({ status: "READY" })); vi.stubGlobal("fetch", fetch);
    const input = { pageNumber: 3, intent: "SHORTER" as const, idempotencyKey: "correction-request-1" };
    await expect(changeStoryPage(project, input)).rejects.toThrow("Connection lost");
    await changeStoryPage(project, input);
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(JSON.parse(fetch.mock.calls[1]![1].body));
  });
  it("undoes the persisted change and reloads the original server words", async () => {
    const story = { schemaVersion: "1", title: "Milo", synopsis: "A gentle walk", emotionalGoal: "Calm", pages: Array.from({ length: 6 }, (_, i) => ({ pageNumber: i + 1, text: i === 2 ? "Original page three" : "Another page", illustrationCue: "Drawing" })) };
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ status: "UNDONE" })).mockResolvedValueOnce(Response.json({ entitlement: "PAID", revision: { revisionId: "revision_1", status: "TEASER_READY", teaser: story }, job: null, corrections: [{ pageNumber: 3, idempotencyKey: "correction-request-1", intent: "SHORTER", status: "UNDONE", canRetry: true }] })); vi.stubGlobal("fetch", fetch);
    await undoStoryPage(project, "correction-request-1");
    const restored = await loadStoryProject(project);
    expect(restored.story?.pages[2]?.text).toBe("Original page three");
    expect(restored.corrections?.[0]?.status).toBe("UNDONE");
    expect(fetch.mock.calls[0]![0]).toBe("/api/undo-page");
  });
  it("surfaces server failures rather than displaying an unsaved edit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "FAILED", error: "Your facts must stay unchanged." })));
    await expect(changeStoryPage(project, { pageNumber: 3, intent: "GENTLER", idempotencyKey: "correction-request-1" })).rejects.toThrow("Your facts must stay unchanged.");
  });
});

import { pageCorrectionState } from "./story-preview";
describe("undo for the live corrected page", () => {
  it("keeps undo available when a later correction fails", () => {
    const jobs = [
      { idempotencyKey: "correction-request-1", pageNumber: 3, intent: "SHORTER" as const, status: "READY" as const, text: "Milo held Mr Bear.", canRetry: true },
      { idempotencyKey: "correction-request-2", pageNumber: 3, intent: "GENTLER" as const, status: "FAILED" as const, canRetry: true }
    ];
    expect(pageCorrectionState(jobs, 3, "Milo held Mr Bear.").undoJob?.idempotencyKey).toBe("correction-request-1");
  });
});
