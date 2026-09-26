/**
 * Anonymous session — F-001 M1 core. The `anonymousProjectId` is the durable owner
 * key; the browser token is only a carrier (random, hashed at rest), so losing the
 * token stays recoverable via an email claim later (M6). Applies guide §7: no PII in
 * session creation; token never in logs.
 */

export interface SessionOwnerProject {
  projectId: string;
  childProfileIds: string[];
  bookIds: string[];
  latestActivityAt: string;
}

export interface AnonymousSession {
  anonymousProjectId: string;
  /** SHA-256 of the raw browser token. The raw token is returned exactly once. */
  browserTokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  claimedByCustomerId?: string;
  claimedAt?: string;
}

export interface Project {
  projectId: string;
  owner:
    | { kind: "anonymous"; anonymousProjectId: string }
    | { kind: "customer"; customerId: string };
  childProfileIds: string[];
  bookIds: string[];
  latestActivityAt: string;
}

/** F-001 §8 scope check: a session may act on a project it owns (or that it claimed). */
export function sessionAllowsProject(session: AnonymousSession, project: Project): boolean {
  if (project.owner.kind === "anonymous") {
    return project.owner.anonymousProjectId === session.anonymousProjectId;
  }
  return session.claimedByCustomerId === project.owner.customerId;
}

export function emptyProject(input: { projectId: string; anonymousProjectId: string; now: string }): Project {
  return {
    projectId: input.projectId,
    owner: { kind: "anonymous", anonymousProjectId: input.anonymousProjectId },
    childProfileIds: [],
    bookIds: [],
    latestActivityAt: input.now
  };
}