import { describe, expect, expectTypeOf, it } from "vitest";
import {
  emptyProject,
  sessionAllowsProject,
  type AnonymousSession,
  type Project,
  type SessionOwnerProject
} from "../src/index";

function session(overrides: Partial<AnonymousSession> = {}): AnonymousSession {
  return {
    anonymousProjectId: "anon-proj-1",
    browserTokenHash: "sha256:abc",
    createdAt: "2026-09-25T00:00:00.000Z",
    lastSeenAt: "2026-09-25T00:00:00.000Z",
    ...overrides
  };
}

describe("domain: anonymous session (F-001)", () => {
  it("models the owner key as the durable anonymousProjectId, not the token hash", () => {
    expectTypeOf<AnonymousSession["anonymousProjectId"]>().toEqualTypeOf<string>();
    expectTypeOf<SessionOwnerProject["projectId"]>().toEqualTypeOf<string>();
    expect(session().anonymousProjectId).toBe("anon-proj-1");
  });

  it("allows a session to act on a project it owns anonymously", () => {
    const project: Project = emptyProject({ projectId: "project-1", anonymousProjectId: "anon-proj-1", now: "2026-09-25T00:00:00.000Z" });
    expect(sessionAllowsProject(session(), project)).toBe(true);
  });

  it("denies access to projects owned by another anonymous session", () => {
    const project: Project = emptyProject({ projectId: "project-1", anonymousProjectId: "anon-proj-2", now: "2026-09-25T00:00:00.000Z" });
    expect(sessionAllowsProject(session(), project)).toBe(false);
  });

  it("grants claimed sessions access to customer-owned projects, and only those (M6 claim)", () => {
    const claimed = session({ claimedByCustomerId: "cust-9", claimedAt: "2026-10-01T00:00:00.000Z" });
    const ours: Project = { projectId: "project-1", owner: { kind: "customer", customerId: "cust-9" }, childProfileIds: [], bookIds: [], latestActivityAt: "2026-09-25T00:00:00.000Z" };
    const theirs: Project = { projectId: "project-2", owner: { kind: "customer", customerId: "cust-10" }, childProfileIds: [], bookIds: [], latestActivityAt: "2026-09-25T00:00:00.000Z" };
    expect(sessionAllowsProject(claimed, ours)).toBe(true);
    expect(sessionAllowsProject(claimed, theirs)).toBe(false);
    expect(sessionAllowsProject(session(), ours)).toBe(false);
  });

  it("starts an empty project with no profiles, no books, and a timestamp", () => {
    const project = emptyProject({ projectId: "project-1", anonymousProjectId: "anon-proj-1", now: "2026-09-25T00:00:00.000Z" });
    expect(project.owner).toEqual({ kind: "anonymous", anonymousProjectId: "anon-proj-1" });
    expect(project.childProfileIds).toEqual([]);
    expect(project.bookIds).toEqual([]);
    expect(project.latestActivityAt).toBe("2026-09-25T00:00:00.000Z");
  });
});