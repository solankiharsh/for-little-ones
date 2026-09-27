import { ageYearsOn, type ChildProfile, type ProfileConsent } from "@for-little-ones/domain";
import type { CreationStore } from "../creation/creation-store";
import type { SessionStore } from "../session/session-service";

/**
 * F-003 profile commands behind the `ChildProfileService` seam. The transport calls
 * these; nothing here knows about HTTP.
 *
 * Ownership is the PROJECT's record of its child profile ids — a profile row carries
 * no owner of its own, so a profile cannot be forged into someone else's scope.
 */
export interface ChildProfileServiceDeps {
  store: CreationStore;
  sessions: Pick<SessionStore, "getProject" | "getProjectByOwner" | "addToProject">;
  now: () => string;
  newId: (prefix: string) => string;
}

export interface CreateProfileInput {
  anonymousProjectId: string;
  projectId: string;
  /** F-003 idempotency: a retried create returns the profile the first call made. */
  creationToken: string;
  name: string;
  displayName: string;
  dateOfBirth: string;
  pronouns: string;
  locale?: string;
  interests?: string[];
  consent: ProfileConsent;
}

export class ChildProfileService {
  constructor(private readonly deps: ChildProfileServiceDeps) {}

  async createProfile(input: CreateProfileInput): Promise<ChildProfile> {
    await this.assertProjectAccess(input.anonymousProjectId, input.projectId);

    const existingId = await this.deps.store.findProfileByCreationToken(input.creationToken);
    if (existingId) {
      const existing = await this.deps.store.getProfile(existingId);
      // A replayed create must not silently hand back a profile from another scope.
      if (existing) {
        const owningProject = await this.deps.sessions.getProjectByOwner(input.anonymousProjectId);
        if (owningProject?.childProfileIds.includes(existing.id)) return existing;
      }
    }

    validateProfileFields({ ...input, today: this.deps.now().slice(0, 10) });
    if (!input.consent.parentConfirmed) {
      throw new Error("recorded parent consent is required before a profile may be stored (F-003 §12)");
    }

    const now = this.deps.now();
    const profileId = this.deps.newId("child");
    const profile: ChildProfile = {
      id: profileId,
      name: input.name.trim(),
      displayName: input.displayName.trim(),
      dateOfBirth: input.dateOfBirth,
      pronouns: input.pronouns.trim(),
      locale: input.locale ?? "en-GB",
      interests: input.interests ?? [],
      facts: [],
      consent: { grantedAt: now, retentionClass: "default" },
      retentionClass: "default",
      status: "active",
      revision: 0,
      creationToken: input.creationToken,
      consentRecord: { ...input.consent, recordedAt: now, sessionOwnerId: input.anonymousProjectId },
      // D024 §5: the profile's own name is a legitimate story character, so it is a
      // relationship from the moment the profile exists.
      relationshipIds: [`rel:self:${profileId}`]
    };
    await this.deps.store.saveProfile(profile);
    await this.deps.sessions.addToProject(input.projectId, { childProfileIds: [profileId], latestActivityAt: now });
    return profile;
  }

  /** F-003 `UpdateChildProfile`: field-level patch behind a revision optimistic lock. */
  async patchProfile(input: {
    anonymousProjectId: string;
    profileId: string;
    expectedRevision: number;
    patch: Partial<Pick<ChildProfile, "name" | "displayName" | "dateOfBirth" | "pronouns" | "locale" | "interests" | "retentionClass" | "status">>;
  }): Promise<ChildProfile> {
    const current = await this.requireOwnedProfile(input.anonymousProjectId, input.profileId);
    const revision = current.revision ?? 0;
    if (revision !== input.expectedRevision) {
      throw new StaleRevisionError(`stale revision for profile ${input.profileId}: expected ${input.expectedRevision}, stored ${revision}`);
    }
    const merged: ChildProfile = { ...current, ...stripUndefined(input.patch) };
    validateProfileFields({ ...merged, today: this.deps.now().slice(0, 10) });
    const updated: ChildProfile = { ...merged, revision: revision + 1 };
    await this.deps.store.saveProfile(updated);
    return updated;
  }

  async getProfile(input: { anonymousProjectId: string; profileId: string }): Promise<ChildProfile> {
    return this.requireOwnedProfile(input.anonymousProjectId, input.profileId);
  }

  private async requireOwnedProfile(anonymousProjectId: string, profileId: string): Promise<ChildProfile> {
    const profile = await this.deps.store.getProfile(profileId);
    if (!profile) throw new ProfileNotFoundError(`child profile not found: ${profileId}`);
    const owningProject = await this.deps.sessions.getProjectByOwner(anonymousProjectId);
    if (!owningProject?.childProfileIds.includes(profileId)) {
      throw new ProfileForbiddenError(`session ${anonymousProjectId} does not own profile ${profileId}`);
    }
    return profile;
  }

  /**
   * F-001 §8: a session may only act inside its own project. A project that does not
   * exist and a project owned by someone else raise the SAME error, so the transport
   * cannot be used to probe which project ids are real.
   */
  private async assertProjectAccess(anonymousProjectId: string, projectId: string): Promise<void> {
    const project = await this.deps.sessions.getProject(projectId);
    if (!project || project.owner.kind !== "anonymous" || project.owner.anonymousProjectId !== anonymousProjectId) {
      throw new ProjectForbiddenError(`session ${anonymousProjectId} does not own project ${projectId}`);
    }
  }
}

export class ProfileNotFoundError extends Error {}
export class ProfileForbiddenError extends Error {}
export class ProjectForbiddenError extends Error {}
export class StaleRevisionError extends Error {}

/**
 * F-003 §6 + §8: names and pronouns are mandatory and the date of birth must be a
 * real, past date (age is always derived at read time, never frozen at capture).
 * Consent is NOT re-checked here — it is a create-time gate and `consentRecord` is
 * not patchable, so there is nothing for a patch to invalidate.
 */
function validateProfileFields(profile: {
  name: string;
  displayName: string;
  dateOfBirth: string;
  pronouns: string;
  today: string;
}): void {
  if (profile.name.trim().length === 0) throw new Error("name is required");
  if (profile.displayName.trim().length === 0) throw new Error("displayName is required");
  if (ageYearsOn(profile.dateOfBirth, profile.today) === undefined) {
    throw new Error(`date of birth must be a real date in the past: ${profile.dateOfBirth}`);
  }
  if (profile.pronouns.trim().length === 0) throw new Error("pronouns are required");
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
