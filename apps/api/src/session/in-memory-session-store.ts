import type { AnonymousSession, Project } from "@for-little-ones/domain";
import type { SessionStore } from "./session-service";

/**
 * In-memory `SessionStore` — the non-production adapter behind the same seam. Used
 * by the transport specs and local runs; `InMemoryDurableRuntime` and this pair are
 * both forbidden as a production substrate (D019/D024).
 */
export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, AnonymousSession>();
  private readonly projects = new Map<string, Project>();

  async createSession(session: AnonymousSession): Promise<void> {
    this.sessions.set(session.anonymousProjectId, session);
  }

  async getSession(anonymousProjectId: string): Promise<AnonymousSession | undefined> {
    return this.sessions.get(anonymousProjectId);
  }

  async getSessionByTokenHash(browserTokenHash: string): Promise<AnonymousSession | undefined> {
    for (const session of this.sessions.values()) {
      if (session.browserTokenHash === browserTokenHash) return session;
    }
    return undefined;
  }

  async saveProject(project: Project): Promise<void> {
    this.projects.set(project.projectId, project);
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    return this.projects.get(projectId);
  }

  async getProjectByOwner(anonymousProjectId: string): Promise<Project | undefined> {
    for (const project of this.projects.values()) {
      if (project.owner.kind === "anonymous" && project.owner.anonymousProjectId === anonymousProjectId) {
        return project;
      }
    }
    return undefined;
  }

  async addToProject(
    projectId: string,
    patch: { childProfileIds?: string[]; bookIds?: string[]; latestActivityAt?: string }
  ): Promise<void> {
    const project = this.projects.get(projectId);
    if (!project) throw new Error(`project not found: ${projectId}`);
    this.projects.set(projectId, {
      ...project,
      childProfileIds: [...project.childProfileIds, ...(patch.childProfileIds ?? [])],
      bookIds: [...project.bookIds, ...(patch.bookIds ?? [])],
      latestActivityAt: patch.latestActivityAt ?? project.latestActivityAt
    });
  }
}
