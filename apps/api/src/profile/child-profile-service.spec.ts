import { describe, expect, it } from "vitest";
import { ChildProfileService } from "./child-profile-service";
import { otherSessionOn, ownedProject } from "../testing/session-harness";

/**
 * F-003 profile commands. The spec's hard requirements live here: `creationToken`
 * idempotency, a field-level patch with a revision optimistic lock, and the
 * D024 §5 self-relationship seeded exactly once at create.
 */
describe("api: child profile service (F-003)", () => {
  it("creates a profile in the caller's project and seeds its self-relationship", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });

    const profile = await service.createProfile({
      anonymousProjectId,
      projectId: project.projectId,
      creationToken: "token-1",
      name: "Ava Solanki",
      displayName: "Ava",
      dateOfBirth: "2021-06-01",
      pronouns: "she",
      locale: "en-GB",
      consent: { parentConfirmed: true }
    });

    expect(profile.id).toBe("child-1");
    expect(profile.revision).toBe(0);
    expect(profile.creationToken).toBe("token-1");
    expect(profile.relationshipIds).toEqual(["rel:self:child-1"]);
    expect((await store.getProfile("child-1"))?.displayName).toBe("Ava");
    // The project is the ownership record; the profile row carries no owner of its own.
    expect((await sessions.getProject(project.projectId))?.childProfileIds).toEqual(["child-1"]);
  });

  it("returns the SAME profile when a retried create replays the creationToken", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    let counter = 0;
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-${(counter++).toString()}` });
    const input = {
      anonymousProjectId,
      projectId: project.projectId,
      creationToken: "token-1",
      name: "Ava Solanki",
      displayName: "Ava",
      dateOfBirth: "2021-06-01",
      pronouns: "she",
      locale: "en-GB",
      consent: { parentConfirmed: true }
    };
    const first = await service.createProfile(input);
    const second = await service.createProfile(input);
    expect(second.id).toBe(first.id);
    expect((await sessions.getProject(project.projectId))?.childProfileIds).toHaveLength(1);
  });

  it("rejects a profile whose DOB is not in the past", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await expect(
      service.createProfile({
        anonymousProjectId,
        projectId: project.projectId,
        creationToken: "token-2",
        name: "Future Child",
        displayName: "Future",
        dateOfBirth: "2030-01-01",
        pronouns: "they",
        locale: "en-GB",
        consent: { parentConfirmed: true }
      })
    ).rejects.toThrow(/date of birth/i);
  });

  it("requires recorded consent before a profile may be stored (F-003 §12)", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await expect(
      service.createProfile({
        anonymousProjectId,
        projectId: project.projectId,
        creationToken: "token-3",
        name: "Ava",
        displayName: "Ava",
        dateOfBirth: "2021-06-01",
        pronouns: "she",
        locale: "en-GB",
        consent: { parentConfirmed: false }
      })
    ).rejects.toThrow(/consent/i);
  });

  it("refuses to create a profile in a project the session does not own", async () => {
    const { store, sessions, anonymousProjectId } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await expect(
      service.createProfile({
        anonymousProjectId,
        projectId: "project-someone-else",
        creationToken: "token-4",
        name: "Ava",
        displayName: "Ava",
        dateOfBirth: "2021-06-01",
        pronouns: "she",
        locale: "en-GB",
        consent: { parentConfirmed: true }
      })
    ).rejects.toThrow(/does not own project/);
  });

  it("patches only the named fields and bumps the revision", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    const created = await service.createProfile({
      anonymousProjectId,
      projectId: project.projectId,
      creationToken: "token-5",
      name: "Ava Solanki",
      displayName: "Ava",
      dateOfBirth: "2021-06-01",
      pronouns: "she",
      locale: "en-GB",
      consent: { parentConfirmed: true }
    });

    const patched = await service.patchProfile({
      anonymousProjectId,
      profileId: created.id,
      expectedRevision: 0,
      patch: { pronouns: "they", interests: ["space", "dinosaurs"] }
    });
    expect(patched.pronouns).toBe("they");
    expect(patched.interests).toEqual(["space", "dinosaurs"]);
    // Untouched fields survive the patch.
    expect(patched.displayName).toBe("Ava");
    expect(patched.revision).toBe(1);
  });

  it("rejects a stale patch with a conflict rather than overwriting (optimistic lock)", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    const created = await service.createProfile({
      anonymousProjectId,
      projectId: project.projectId,
      creationToken: "token-6",
      name: "Ava Solanki",
      displayName: "Ava",
      dateOfBirth: "2021-06-01",
      pronouns: "she",
      locale: "en-GB",
      consent: { parentConfirmed: true }
    });
    await service.patchProfile({ anonymousProjectId, profileId: created.id, expectedRevision: 0, patch: { pronouns: "they" } });

    await expect(
      service.patchProfile({ anonymousProjectId, profileId: created.id, expectedRevision: 0, patch: { pronouns: "she" } })
    ).rejects.toThrow(/stale revision/i);
    expect((await store.getProfile(created.id))?.pronouns).toBe("they");
  });

  it("rejects a DOB patch into the future through the same validation as create", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    const created = await service.createProfile({
      anonymousProjectId,
      projectId: project.projectId,
      creationToken: "token-7",
      name: "Ava Solanki",
      displayName: "Ava",
      dateOfBirth: "2021-06-01",
      pronouns: "she",
      locale: "en-GB",
      consent: { parentConfirmed: true }
    });
    await expect(
      service.patchProfile({ anonymousProjectId, profileId: created.id, expectedRevision: 0, patch: { dateOfBirth: "2030-01-01" } })
    ).rejects.toThrow(/date of birth/i);
  });

  it("refuses a profile owned by another session (F-003 §8 AuthZ)", async () => {
    const { store, sessions, anonymousProjectId, project } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    const created = await service.createProfile({
      anonymousProjectId,
      projectId: project.projectId,
      creationToken: "token-8",
      name: "Ava Solanki",
      displayName: "Ava",
      dateOfBirth: "2021-06-01",
      pronouns: "she",
      locale: "en-GB",
      consent: { parentConfirmed: true }
    });

    // A different browser, sharing the same database.
    const other = await otherSessionOn(sessions);
    const otherService = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-9` });
    await expect(
      otherService.getProfile({ anonymousProjectId: other, profileId: created.id })
    ).rejects.toThrow(/does not own/);
  });

  it("returns a missing profile as not-found, not as a permission error", async () => {
    const { store, sessions, anonymousProjectId } = await ownedProject();
    const service = new ChildProfileService({ store, sessions, now: () => "2026-09-25T10:00:00.000Z", newId: (p) => `${p}-1` });
    await expect(service.getProfile({ anonymousProjectId, profileId: "child-ghost" })).rejects.toThrow(/not found/i);
  });
});
