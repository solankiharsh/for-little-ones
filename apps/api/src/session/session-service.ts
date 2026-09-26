import {
  emptyProject,
  sessionAllowsProject,
  type AnonymousSession,
  type Project
} from "@for-little-ones/domain";
import { generateBrowserToken, hashBrowserToken } from "./token";

export interface SessionStore {
  createSession(session: AnonymousSession): Promise<void>;
  getSession(anonymousProjectId: string): Promise<AnonymousSession | undefined>;
  getSessionByTokenHash(browserTokenHash: string): Promise<AnonymousSession | undefined>;
  saveProject(project: Project): Promise<void>;
  getProject(projectId: string): Promise<Project | undefined>;
}

export interface SessionServiceDeps {
  store: SessionStore;
  now: () => string;
  newId: (prefix: string) => string;
}

/**
 * F-001 M1 session lifecycle. A session start creates the durable owner key
 * (`anonymousProjectId`) + an empty Project, and returns the raw browser token
 * exactly once. No PII enters session creation.
 */
export class AnonymousSessionService {
  constructor(private readonly deps: SessionServiceDeps) {}

  async startSession(): Promise<{ session: AnonymousSession; rawToken: string; project: Project }> {
    const now = this.deps.now();
    const anonymousProjectId = this.deps.newId("anon");
    const rawToken = generateBrowserToken();
    const session: AnonymousSession = {
      anonymousProjectId,
      browserTokenHash: await hashBrowserToken(rawToken),
      createdAt: now,
      lastSeenAt: now
    };
    const project = emptyProject({ projectId: this.deps.newId("project"), anonymousProjectId, now });
    await this.deps.store.createSession(session);
    await this.deps.store.saveProject(project);
    return { session, rawToken, project };
  }

  /** F-001 activity touch; keeps the browser token's hash the only stored carrier. */
  async touch(anonymousProjectId: string): Promise<void> {
    const session = await this.deps.store.getSession(anonymousProjectId);
    if (!session) throw new Error(`unknown anonymous session: ${anonymousProjectId}`);
    await this.deps.store.createSession({ ...session, lastSeenAt: this.deps.now() });
  }

  /** F-001: the browser presents its raw token; we look it up by digest — never by the caller-supplied id. */
  async resolveSession(rawToken: string): Promise<AnonymousSession> {
    const session = await this.deps.store.getSessionByTokenHash(await hashBrowserToken(rawToken));
    if (!session) throw new Error(`unknown session for presented browser token`);
    return session;
  }

  /** F-001 §8 scope check as the transport-facing guard: throws on any cross-session access. */
  async assertCanAccessProject(anonymousProjectId: string, projectId: string): Promise<Project> {
    const session = await this.deps.store.getSession(anonymousProjectId);
    if (!session) throw new Error(`unknown anonymous session: ${anonymousProjectId}`);
    const project = await this.deps.store.getProject(projectId);
    if (!project) throw new Error(`project not found: ${projectId}`);
    if (!sessionAllowsProject(session, project)) throw new Error(`session does not own project: ${projectId}`);
    return project;
  }
}