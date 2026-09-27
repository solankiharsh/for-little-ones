import { describe, expect, it } from "vitest";
import type { ChildProfile, Project } from "@for-little-ones/domain";
import { InMemoryCreationStore } from "../creation/creation-store";
import { InMemorySessionStore } from "../session/in-memory-session-store";
import { AnonymousSessionService } from "../session/session-service";

/** A started session with its project — the owner scope every spec below runs in. */
export async function ownedProject(): Promise<{
  store: InMemoryCreationStore;
  sessions: InMemorySessionStore;
  sessionService: AnonymousSessionService;
  anonymousProjectId: string;
  project: Project;
}> {
  const sessions = new InMemorySessionStore();
  let counter = 0;
  const sessionService = new AnonymousSessionService({
    store: sessions,
    now: () => `2026-09-25T10:00:00.${String(counter++).padStart(3, "0")}Z`,
    newId: (prefix) => `${prefix}-${counter++}`
  });
  const { session, project } = await sessionService.startSession();
  return { store: new InMemoryCreationStore(), sessions, sessionService, anonymousProjectId: session.anonymousProjectId, project };
}

/** The F-001 §8 guard, wired the way the transport wires it. */
export function projectGuard(sessions: InMemorySessionStore) {
  return async (anonymousProjectId: string, projectId: string): Promise<Project> => {
    const session = await sessions.getSession(anonymousProjectId);
    if (!session) throw new Error(`unknown anonymous session: ${anonymousProjectId}`);
    const project = await sessions.getProject(projectId);
    if (!project) throw new Error(`project not found: ${projectId}`);
    if (project.owner.kind !== "anonymous" || project.owner.anonymousProjectId !== session.anonymousProjectId) {
      throw new Error(`session does not own project: ${projectId}`);
    }
    return project;
  };
}

/** A second anonymous session on the SAME stores — the "different browser" case. */
export async function otherSessionOn(sessions: InMemorySessionStore): Promise<string> {
  let counter = 100;
  const service = new AnonymousSessionService({
    store: sessions,
    now: () => `2026-09-25T11:00:00.${String(counter++).padStart(3, "0")}Z`,
    newId: (prefix) => `${prefix}-${counter++}`
  });
  const { session } = await service.startSession();
  return session.anonymousProjectId;
}

/**
 * Drops a profile straight into a project. Specs that exercise a *different* service
 * (facts) need an existing profile but are not testing profile creation, so they seed
 * through here rather than reaching for `ChildProfileService` and its id/tokens.
 */
export async function seededProfileIn(
  store: InMemoryCreationStore,
  sessions: InMemorySessionStore,
  projectId: string,
  overrides: Partial<ChildProfile> & Pick<ChildProfile, "id"> = { id: "child-ava" }
): Promise<ChildProfile> {
  const profile: ChildProfile = {
    name: "Ava Solanki",
    displayName: "Ava",
    dateOfBirth: "2021-06-01",
    pronouns: "she",
    locale: "en-GB",
    interests: [],
    facts: [],
    consent: { grantedAt: "2026-09-01T00:00:00.000Z", retentionClass: "default" },
    retentionClass: "default",
    ...overrides
  };
  await store.saveProfile(profile);
  await sessions.addToProject(projectId, { childProfileIds: [profile.id] });
  return profile;
}
