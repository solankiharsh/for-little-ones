import { describe, expect, expectTypeOf, it } from "vitest";
import { ageYearsOn, type ChildProfile, type ProfileConsent } from "../src/index";

describe("domain: child profile (F-003)", () => {
  it("derives age arithmetically from the stored DOB (never frozen at capture)", () => {
    expect(ageYearsOn("2021-06-01", "2026-09-25")).toBe(5);
    expect(ageYearsOn("2021-09-26", "2026-09-25")).toBe(4);
    expect(ageYearsOn("2021-09-25", "2026-09-25")).toBe(5);
    expect(ageYearsOn("2021-12-31", "2026-01-01")).toBe(4);
  });

  it("returns undefined for invalid or future DOBs", () => {
    expect(ageYearsOn("not-a-date", "2026-09-25")).toBeUndefined();
    expect(ageYearsOn("2030-01-01", "2026-09-25")).toBeUndefined();
    expect(ageYearsOn("2026-09-25", "2026-09-25")).toBeUndefined();
  });

  it("keeps M0 rails compatible while the M1 fields stay optional and typed", () => {
    expectTypeOf<ChildProfile["status"]>().toEqualTypeOf<"draft" | "active" | "archived" | undefined>();
    expectTypeOf<ChildProfile["factIds"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<ChildProfile["suggestedFactIds"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<ChildProfile["photoReferenceIds"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<ChildProfile["relationshipIds"]>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<ProfileConsent["parentConfirmed"]>().toEqualTypeOf<boolean>();
  });

  it("accepts a profile in the shape the demo fixtures use (no new required fields)", () => {
    const sample: ChildProfile = {
      id: "child-1",
      name: "Ava",
      displayName: "Ava",
      dateOfBirth: "2020-04-02",
      pronouns: "she",
      locale: "en",
      interests: ["dinosaurs"],
      facts: [{ key: "interest", value: "dinosaurs", immutable: true }],
      consent: { grantedAt: "2026-09-01T00:00:00.000Z", retentionClass: "default" },
      retentionClass: "default"
    };
    expect(sample.locale).toBe("en");
    expect(sample.retentionClass).toBe("default");
  });
});