import { describe, expect, it } from "vitest";
import type { Fact, SportOption } from "@for-little-ones/domain";
import { FactService } from "./fact-service";
import { otherSessionOn, ownedProject, seededProfileIn } from "../testing/session-harness";
import { sampleProfile } from "../testing/fixtures";

/**
 * F-006 writers + F-003 audited transitions. Two rules carry the weight here:
 * a client can never write `parentConfirmed` directly, and every confirm/reject is
 * audited on the profile (F-003 `confirmations[]`).
 */
describe("api: fact service (F-006 writers, F-003 audited transitions)", () => {
  it("serves locale-bound typed options, and [] for a type with no catalogue", async () => {
    const { store, sessions } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });

    const gbColours = await service.getFactOptions({ type: "favouriteColour", locale: "en-GB" });
    expect(gbColours.length).toBeGreaterThan(0);
    expect(gbColours.every((o) => o.locale === "en-GB")).toBe(true);
    // The F-006 §11 point, on the one option the catalogue localises: the same
    // locale-stable gameId reads "football" in en-GB and "soccer" in en-US.
    const gbFootball = (await service.getFactOptions({ type: "sport", locale: "en-GB" })).find((o) => o.id === "association-football");
    const usFootball = (await service.getFactOptions({ type: "sport", locale: "en-US" })).find((o) => o.id === "association-football");
    expect([gbFootball?.label, usFootball?.label]).toEqual(["football", "soccer"]);

    // sport options expose the locale-stable gameId.
    const sports = (await service.getFactOptions({ type: "sport", locale: "en-GB" })) as SportOption[];
    expect(sports.map((s) => s.id)).toContain("association-football");
    expect(await service.getFactOptions({ type: "customFact", locale: "en-GB" })).toEqual([]);
    // An unknown locale yields nothing rather than silently falling back to en-GB.
    expect(await service.getFactOptions({ type: "favouriteColour", locale: "fr-FR" })).toEqual([]);
  });

  it("parks a suggested fact in suggestedFactIds and only confirm moves it to factIds", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    // sampleProfile() already ships a confirmed `fact-1`, so this spec mints a
    // distinct id: a collision would silently overwrite the fixture's fact.
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-added` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());

    const added = await service.addFact({
      anonymousProjectId,
      childProfileId: "child-ava",
      factToken: "ft-bucket",
      type: "favouriteColour",
      value: { kind: "enum", optionId: "purple" },
      locale: "en-GB"
    });
    let profile = await store.getProfile("child-ava");
    expect(profile?.factIds ?? []).not.toContain(added.id);
    expect(profile?.suggestedFactIds ?? []).toContain(added.id);

    await service.confirmFact({ anonymousProjectId, factId: added.id });
    profile = await store.getProfile("child-ava");
    expect(profile?.factIds ?? []).toContain(added.id);
    expect(profile?.suggestedFactIds ?? []).not.toContain(added.id);
  });

  it("adds a parent-typed fact as `suggested`, never as confirmed", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());

    const fact = await service.addFact({
      anonymousProjectId,
      childProfileId: "child-ava",
      factToken: "ft-1",
      type: "favouriteColour",
      value: { kind: "enum", optionId: "purple" },
      locale: "en-GB"
    });
    // The client asked; the confirmation verb has not happened yet.
    expect(fact.state).toBe("suggested");
    expect(fact.source).toBe("parentTyped");
    expect(fact.factToken).toBe("ft-1");
    // A suggested fact must never appear on the generation-eligible path.
    expect(await service.getFactsForStory({ anonymousProjectId, childProfileId: "child-ava" })).toEqual([]);
  });

  it("refuses a client attempt to write parentConfirmed directly", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    await expect(
      service.addFact({
        anonymousProjectId,
        childProfileId: "child-ava",
        factToken: "ft-2",
        type: "favouriteColour",
        value: { kind: "enum", optionId: "purple" },
        locale: "en-GB",
        state: "parentConfirmed"
      })
    ).rejects.toThrow(/parentConfirmed/);
  });

  it("dedupes a retried add on its factToken", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    const input = {
      anonymousProjectId,
      childProfileId: "child-ava",
      factToken: "ft-3",
      type: "favouriteColour" as const,
      value: { kind: "enum" as const, optionId: "purple" },
      locale: "en-GB" as const
    };
    const first = await service.addFact(input);
    const second = await service.addFact(input);
    expect(second.id).toBe(first.id);
    expect((await store.listFactsByProfile("child-ava")).map((f) => f.id)).toEqual([first.id]);
  });

  it("rejects a value the catalogue does not know, with every issue listed", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    await expect(
      service.addFact({
        anonymousProjectId,
        childProfileId: "child-ava",
        factToken: "ft-4",
        type: "favouriteColour",
        value: { kind: "enum", optionId: "ultraviolet" },
        locale: "en-GB"
      })
    ).rejects.toThrow(/not a catalogue option/);
  });

  it("enforces the three-custom-fact cap", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-${Math.random()}` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    for (let i = 0; i < 3; i += 1) {
      await service.addFact({
        anonymousProjectId,
        childProfileId: "child-ava",
        factToken: `ft-custom-${i}`,
        type: "customFact",
        value: { kind: "custom", subject: "toy", claim: `claim ${i}` },
        locale: "en-GB"
      });
    }
    await expect(
      service.addFact({
        anonymousProjectId,
        childProfileId: "child-ava",
        factToken: "ft-custom-4",
        type: "customFact",
        value: { kind: "custom", subject: "toy", claim: "one too many" },
        locale: "en-GB"
      })
    ).rejects.toThrow(/limit 3/);
  });

  it("confirming a suggested fact makes it generation-eligible and audits the profile", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    const added = await service.addFact({
      anonymousProjectId,
      childProfileId: "child-ava",
      factToken: "ft-5",
      type: "favouriteColour",
      value: { kind: "enum", optionId: "purple" },
      locale: "en-GB"
    });

    const confirmed = await service.confirmFact({ anonymousProjectId, factId: added.id });
    expect(confirmed.state).toBe("parentConfirmed");
    expect(confirmed.confirmedBy).toEqual({ sessionOwnerId: anonymousProjectId, recordedAt: "2026-09-25T10:00:00.000Z" });
    expect((await service.getFactsForStory({ anonymousProjectId, childProfileId: "child-ava" })).map((f) => f.id)).toEqual([added.id]);
    expect((await store.getProfile("child-ava"))?.confirmations).toEqual([`I confirmed this fact: ${added.id}`]);
  });

  it("confirming twice is idempotent, not an error", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    const added = await service.addFact({ anonymousProjectId, childProfileId: "child-ava", factToken: "ft-6", type: "favouriteColour", value: { kind: "enum", optionId: "purple" }, locale: "en-GB" });
    await service.confirmFact({ anonymousProjectId, factId: added.id });
    const again = await service.confirmFact({ anonymousProjectId, factId: added.id });
    expect(again.state).toBe("parentConfirmed");
    expect((await store.getProfile("child-ava"))?.confirmations).toHaveLength(1);
  });

  it("rejecting a fact keeps it out of generation and never re-asks it", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    const added = await service.addFact({ anonymousProjectId, childProfileId: "child-ava", factToken: "ft-7", type: "favouriteColour", value: { kind: "enum", optionId: "purple" }, locale: "en-GB" });

    const rejected = await service.rejectFact({ anonymousProjectId, factId: added.id });
    expect(rejected.state).toBe("rejected");
    expect(await service.getFactsForStory({ anonymousProjectId, childProfileId: "child-ava" })).toEqual([]);
  });

  it("removing a fact takes it off every read path but keeps its story-usage audit", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    const added = await service.addFact({ anonymousProjectId, childProfileId: "child-ava", factToken: "ft-8", type: "favouriteColour", value: { kind: "enum", optionId: "purple" }, locale: "en-GB" });
    await service.confirmFact({ anonymousProjectId, factId: added.id });
    await store.saveFact({ ...(await store.getFact(added.id))!, storyUsage: [{ storyId: "book-1", usedAs: "the ribbon" }] } as Fact);

    await service.removeFact({ anonymousProjectId, factId: added.id });
    expect(await store.getFact(added.id)).toBeUndefined();
    expect(await service.getFactsForStory({ anonymousProjectId, childProfileId: "child-ava" })).toEqual([]);
    expect(await store.removedFactUsage(added.id)).toEqual([{ storyId: "book-1", usedAs: "the ribbon" }]);
  });

  it("refuses a fact transition on a profile another session owns", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await seededProfileIn(store, sessions, project.projectId, sampleProfile());
    const added = await service.addFact({ anonymousProjectId, childProfileId: "child-ava", factToken: "ft-9", type: "favouriteColour", value: { kind: "enum", optionId: "purple" }, locale: "en-GB" });

    const intruder = await otherSessionOn(sessions);
    const intruderService = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-9` });
    await expect(intruderService.confirmFact({ anonymousProjectId: intruder, factId: added.id })).rejects.toThrow(/does not own/);
    await expect(intruderService.removeFact({ anonymousProjectId: intruder, factId: added.id })).rejects.toThrow(/does not own/);
  });

  it("reports a missing fact as not-found", async () => {
    const { store, sessions, anonymousProjectId } = await ownedProject();
    const service = new FactService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await expect(service.confirmFact({ anonymousProjectId, factId: "fact-ghost" })).rejects.toThrow(/not found/i);
  });
});
