import { describe, expect, it } from "vitest";
import {
  hashOwnerToken,
  parseCreationDraft,
  parsePaymentState,
  readableStory,
  readBearerToken
} from "./creation-projects";

describe("creation project boundary", () => {
  it("accepts a bounded draft and normalises customer text", () => {
    expect(parseCreationDraft({ childName: " Milo ", age: "6", world: " Space ", favourites: ["Stars"], detail: " scarf ", dedication: " hello " })).toEqual({
      childName: "Milo", age: "6", world: "Space", favourites: ["Stars"], detail: "scarf", dedication: "hello"
    });
    expect(parseCreationDraft({ childName: "", age: "99" })).toBeNull();
  });

  it("only accepts 256-bit bearer credentials and hashes them before storage", () => {
    const token = "ab".repeat(32);
    expect(readBearerToken(`Bearer ${token}`)).toBe(token);
    expect(readBearerToken("Bearer short")).toBeNull();
    expect(hashOwnerToken(token)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOwnerToken(token)).not.toBe(token);
  });

  it("fails closed on a payment state it does not recognise", () => {
    expect(parsePaymentState("captured")).toBe("captured");
    expect(parsePaymentState("cancelled")).toBe("cancelled");
    expect(parsePaymentState("PAID")).toBe("pending");
    expect(parsePaymentState(undefined)).toBe("pending");
  });
});

describe("entitlement-gated story read", () => {
  const revision = {
    teaser: { pages: [{ pageNumber: 1, text: "Teaser page", illustrationCue: "Locked" }] },
    story: { pages: Array.from({ length: 6 }, (_, index) => ({ pageNumber: index + 1, text: `Full page ${index + 1}`, illustrationCue: "Scene" })) }
  };

  it("withholds the complete story until the payment record says captured", () => {
    expect(readableStory(revision, "pending")).toBe(revision.teaser);
    expect(readableStory(revision, "authorized")).toBe(revision.teaser);
    expect(readableStory(revision, "refunded")).toBe(revision.teaser);
    expect(readableStory(revision, "cancelled")).toBe(revision.teaser);
    expect(readableStory(revision, "captured")).toBe(revision.story);
  });

  it("falls back to the teaser when a captured project has no stored story", () => {
    expect(readableStory({ teaser: revision.teaser }, "captured")).toBe(revision.teaser);
  });
});
