import { describe, expect, it } from "vitest";
import type { AnonymousSession, Project } from "@for-little-ones/domain";
import { AnonymousSessionService, type SessionStore } from "../../src/session/session-service";

function memorySessionStore(): SessionStore {
  const sessions = new Map<string, AnonymousSession>();
  const projects = new Map<string, Project>();
  return {
    async createSession(s) {
      sessions.set(s.anonymousProjectId, s);
    },
    async getSession(id) {
      return sessions.get(id);
    },
    async getSessionByTokenHash(hash) {
      for (const session of sessions.values()) {
        if (session.browserTokenHash === hash) return session;
      }
      return undefined;
    },
    async saveProject(p) {
      projects.set(p.projectId, p);
    },
    async getProject(id) {
      return projects.get(id);
    }
  };
}

function service(store: SessionStore) {
  let counter = 0;
  return new AnonymousSessionService({
    store,
    now: () => `2026-09-25T10:00:00.${String(counter++).padStart(3, "0")}Z`,
    newId: (prefix) => `${prefix}-${counter++}`
  });
}

describe("api: anonymous session service (F-001 M1)", () => {
  it("starts a session returning the raw token once and storing only its hash", async () => {
    const store = memorySessionStore();
    const svc = service(store);
    const { session, rawToken, project } = await svc.startSession();

    expect(rawToken.length).toBeGreaterThan(32);
    expect(session.browserTokenHash).toMatch(/^sha256:/u);
    expect(session.browserTokenHash).not.toContain(rawToken);
    expect(project.owner).toEqual({ kind: "anonymous", anonymousProjectId: session.anonymousProjectId });
    expect(project.childProfileIds).toEqual([]);
    expect(project.bookIds).toEqual([]);
  });

  it("resolves a session from the presented browser token by digest lookup (never the raw token)", async () => {
    const store = memorySessionStore();
    const svc = service(store);
    const { rawToken, session } = await svc.startSession();

    const resolved = await svc.resolveSession(rawToken);
    expect(resolved.anonymousProjectId).toBe(session.anonymousProjectId);
    await expect(svc.resolveSession("not-the-token")).rejects.toThrow(/unknown session/u);
  });

  it("guards project access to the owning session (F-001 §8)", async () => {
    const store = memorySessionStore();
    const svc = service(store);
    const { project } = await svc.startSession();
    const other = await svc.startSession();
    if (project.owner.kind !== "anonymous") throw new Error("expected anonymous owner");

    await expect(svc.assertCanAccessProject(project.owner.anonymousProjectId, project.projectId)).resolves.toBeDefined();
    await expect(svc.assertCanAccessProject(other.session.anonymousProjectId, project.projectId)).rejects.toThrow("does not own");
    await expect(svc.assertCanAccessProject(other.session.anonymousProjectId, "nope")).rejects.toThrow("not found");
  });

  it("touch advances lastSeenAt", async () => {
    const store = memorySessionStore();
    const svc = service(store);
    const { session } = await svc.startSession();
    const before = (await store.getSession(session.anonymousProjectId))!;
    await svc.touch(session.anonymousProjectId);
    const after = (await store.getSession(session.anonymousProjectId))!;
    expect(after.lastSeenAt > before.lastSeenAt).toBe(true);
  });
});