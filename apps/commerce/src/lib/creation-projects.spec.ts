import { describe, expect, it } from "vitest";
import { hashOwnerToken, parseCreationDraft, readBearerToken } from "./creation-projects";

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
});
