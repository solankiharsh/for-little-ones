import { describe, expect, it } from "vitest";
import { loadSavedCreation, parseStoryProjectSnapshot, saveCreation } from "./story-preview";

describe("guided creation persistence", () => {
  it("round-trips a refresh-safe draft", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value; }
    };
    const value = {
      draft: {
        childName: "Milo",
        age: "6",
        world: "Bedtime wonder",
        favourites: ["Space"],
        detail: "Carries a red scarf",
        dedication: "Dream big."
      }
    };

    saveCreation(storage, value);
    expect(loadSavedCreation(storage)).toEqual(value);
  });

  it("ignores corrupted saved data", () => {
    expect(loadSavedCreation({ getItem: () => "not-json" })).toBeNull();
  });

  it("accepts a server-restored teaser and terminal job", () => {
    const teaser = {
      schemaVersion: "1" as const,
      title: "Milo and the Moonbeam",
      synopsis: "Milo follows a friendly moonbeam home.",
      emotionalGoal: "Curiosity becomes confidence.",
      pages: Array.from({ length: 6 }, (_, index) => ({
        pageNumber: index + 1,
        text: index === 0 ? "Milo looked up." : "Story page ready after payment.",
        illustrationCue: index === 0 ? "Milo beneath the moon." : "Locked until payment is confirmed."
      })),
      generationMetadata: { model: "google/gemini-2.5-flash", attemptCount: 1 }
    };

    expect(parseStoryProjectSnapshot({
      projectId: "project_123",
      paymentState: "pending",
      entitlement: "TEASER",
      revision: { revisionId: "revision_123", version: 1, status: "TEASER_READY", teaser, story: teaser },
      job: { jobId: "job_123", kind: "STORY_PREVIEW", status: "READY", progress: 100, errorCode: null }
    })).toEqual({ entitlement: "TEASER", revisionId: "revision_123", revisionStatus: "TEASER_READY", story: teaser, jobKind: "STORY_PREVIEW", jobStatus: "READY", progress: 100 });
  });

  it("restores the complete story the service released after payment", () => {
    const story = {
      schemaVersion: "1" as const,
      title: "Milo and the Moonbeam",
      synopsis: "Milo follows a friendly moonbeam home.",
      emotionalGoal: "Curiosity becomes confidence.",
      pages: Array.from({ length: 6 }, (_, index) => ({
        pageNumber: index + 1, text: `Milo page ${index + 1}.`, illustrationCue: `Scene ${index + 1}`
      }))
    };

    expect(parseStoryProjectSnapshot({
      projectId: "project_123",
      paymentState: "captured",
      entitlement: "PAID",
      revision: { revisionId: "revision_123", version: 1, status: "TEASER_READY", teaser: { title: "partial" }, story },
      job: { jobId: "job_123", kind: "STORY_PREVIEW", status: "READY", progress: 100, errorCode: null }
    })?.story).toEqual(story);
  });

  it("rejects a malformed server-restored teaser", () => {
    expect(parseStoryProjectSnapshot({
      projectId: "project_123",
      paymentState: "pending",
      entitlement: "TEASER",
      revision: { revisionId: "revision_123", version: 1, status: "TEASER_READY", teaser: { title: "Incomplete" }, story: { title: "Incomplete" } },
      job: null
    })).toBeNull();
  });
});
