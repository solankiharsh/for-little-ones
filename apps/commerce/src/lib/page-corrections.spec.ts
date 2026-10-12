import { describe, expect, it } from "vitest";
import { applyPageCorrection } from "./page-corrections";

const story = { schemaVersion: "1" as const, title: "Milo's adventure", synopsis: "A gentle discovery", emotionalGoal: "Kindness", pages: Array.from({ length: 6 }, (_, i) => ({ pageNumber: i + 1, text: i === 2 ? "Milo held Mr Bear beside the pond." : `Original page ${i + 1}`, illustrationCue: `Drawing ${i + 1}` })) };

describe("page text correction", () => {
  it("changes only the requested page's words and leaves the input intact", () => {
    const corrected = applyPageCorrection(story, 3, "Milo held Mr Bear.", ["Milo", "Mr Bear"]);
    expect(corrected.pages[2]).toEqual({ pageNumber: 3, text: "Milo held Mr Bear.", illustrationCue: "Drawing 3" });
    expect(corrected.pages.filter((p) => p.pageNumber !== 3)).toEqual(story.pages.filter((p) => p.pageNumber !== 3));
    expect(story.pages[2]?.text).toBe("Milo held Mr Bear beside the pond.");
  });
  it("rejects a correction that drops a referenced immutable fact", () => {
    expect(() => applyPageCorrection(story, 3, "Milo held a rabbit.", ["Milo", "Mr Bear"])).toThrow("facts");
  });
});

import { reserveCorrection, finishCorrection, undoCorrection, correctionHistory } from "./page-corrections";
import { hashOwnerToken } from "./creation-projects";
import { correctionTestDb } from "./correction-test-db";
const token = "ab".repeat(32);
const input = { revisionId: "revision_1", pageNumber: 3, intent: "SHORTER" as const, idempotencyKey: "correction-key-001" };
function database(paymentState = "captured", status = "TEASER_READY") {
  return correctionTestDb({ flo_creation_project: [{ id: "project_1", owner_token_hash: hashOwnerToken(token), payment_state: paymentState }], flo_creation_revision: [{ id: "revision_1", project_id: "project_1", status, story: story, draft: { childName: "Milo", age: "6", detail: "Mr Bear", favourites: [] } }], flo_page_correction: [] });
}

describe("persisted correction API boundary", () => {
  it("denies foreign owners and unpaid or approved stories before reserving work", async () => {
    await expect(reserveCorrection(database(), "project_1", "cd".repeat(32), input)).rejects.toMatchObject({ status: 404 });
    await expect(reserveCorrection(database("pending"), "project_1", token, input)).rejects.toMatchObject({ status: 403 });
    await expect(reserveCorrection(database("refunded"), "project_1", token, input)).rejects.toMatchObject({ status: 403 });
    await expect(reserveCorrection(database("captured", "APPROVED"), "project_1", token, input)).rejects.toMatchObject({ status: 409 });
  });
  it("replays running and completed requests without reserving another provider attempt", async () => {
    const db = database();
    const first = await reserveCorrection(db, "project_1", token, input);
    expect(first).toHaveProperty("attemptToken");
    const replay = await reserveCorrection(db, "project_1", token, input);
    expect(replay).not.toHaveProperty("attemptToken");
    await finishCorrection(db, "project_1", token, { ...input, attemptToken: (first as { attemptToken: string }).attemptToken, status: "READY", text: "Milo held Mr Bear." });
    expect(await reserveCorrection(db, "project_1", token, input)).toMatchObject({ status: "READY", text: "Milo held Mr Bear." });
    const saved = await db("flo_creation_revision").where({ id: "revision_1" }).first();
    expect(saved.story.pages.filter((p: { pageNumber: number }) => p.pageNumber !== 3)).toEqual(story.pages.filter((p) => p.pageNumber !== 3));
    expect(saved.story.pages[2].illustrationCue).toBe("Drawing 3");
  });
  it("recovers a failed attempt with the same key and keeps the old page until success", async () => {
    const db = database();
    const first = await reserveCorrection(db, "project_1", token, input) as { attemptToken: string };
    await finishCorrection(db, "project_1", token, { ...input, attemptToken: first.attemptToken, status: "FAILED" });
    expect((await db("flo_creation_revision").first()).story).toEqual(story);
    const retry = await reserveCorrection(db, "project_1", token, input) as { attemptToken: string };
    expect(retry.attemptToken).not.toBe(first.attemptToken);
    await expect(finishCorrection(db, "project_1", token, { ...input, attemptToken: first.attemptToken, status: "READY", text: "Milo held Mr Bear." })).rejects.toMatchObject({ status: 409 });
  });
  it("enforces two changes per page and a two-attempt retry limit", async () => {
    const db = database();
    for (let i = 0; i < 2; i++) {
      const job = await reserveCorrection(db, "project_1", token, input) as { attemptToken: string };
      await finishCorrection(db, "project_1", token, { ...input, attemptToken: job.attemptToken, status: "FAILED" });
    }
    await expect(reserveCorrection(db, "project_1", token, input)).rejects.toMatchObject({ status: 409 });
    const second = { ...input, idempotencyKey: "correction-key-002" };
    const job = await reserveCorrection(db, "project_1", token, second) as { attemptToken: string };
    await finishCorrection(db, "project_1", token, { ...second, attemptToken: job.attemptToken, status: "FAILED" });
    await expect(reserveCorrection(db, "project_1", token, { ...input, idempotencyKey: "correction-key-003" })).rejects.toMatchObject({ status: 409 });
  });
  it("restores the original page on undo and leaves the request deduplicated", async () => {
    const db = database();
    const job = await reserveCorrection(db, "project_1", token, input) as { attemptToken: string };
    await finishCorrection(db, "project_1", token, { ...input, attemptToken: job.attemptToken, status: "READY", text: "Milo held Mr Bear." });
    await undoCorrection(db, "project_1", token, input.revisionId, input.idempotencyKey);
    expect((await db("flo_creation_revision").first()).story).toEqual(story);
    expect(await reserveCorrection(db, "project_1", token, input)).toMatchObject({ status: "UNDONE" });
  });
  it("shows interrupted work as retryable after lease expiry and rejects late completion", async () => {
    const db = database();
    const job = await reserveCorrection(db, "project_1", token, input) as { attemptToken: string };
    await db("flo_page_correction").update({ lease_until: new Date(0) });
    expect(await correctionHistory(db, input.revisionId)).toMatchObject([{ status: "FAILED", canRetry: true }]);
    const late = await finishCorrection(db, "project_1", token, { ...input, attemptToken: job.attemptToken, status: "READY", text: "Milo held Mr Bear." });
    expect(late.status).toBe("FAILED");
    expect((await db("flo_creation_revision").first()).story).toEqual(story);
  });
  it("fails a fact-changing result without replacing the original page", async () => {
    const db = database();
    const job = await reserveCorrection(db, "project_1", token, input) as { attemptToken: string };
    expect(await finishCorrection(db, "project_1", token, { ...input, attemptToken: job.attemptToken, status: "READY", text: "Milo held a rabbit." })).toMatchObject({ status: "FAILED" });
    expect((await db("flo_creation_revision").first()).story).toEqual(story);
  });
});
