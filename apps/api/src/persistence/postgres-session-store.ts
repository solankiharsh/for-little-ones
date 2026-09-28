import type { AnonymousSession, Project } from "@for-little-ones/domain";
import type { Pool } from "pg";

/**
 * Slice-2 `SessionStore` adapter (D024 §8). One row per anonymous session, keyed by
 * the durable owner id; the browser token is only ever present as its hash. Sessions
 * are looked up by presented-token digest — never by a caller-supplied owner id.
 */

export class PostgresSessionStore {
  constructor(private readonly pool: Pool) {}

  async createSession(session: AnonymousSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO flo_sessions (anonymous_project_id, browser_token_hash, created_at, last_seen_at, claimed_by_customer_id, claimed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (anonymous_project_id) DO UPDATE
         SET browser_token_hash = EXCLUDED.browser_token_hash,
             last_seen_at = EXCLUDED.last_seen_at,
             claimed_by_customer_id = EXCLUDED.claimed_by_customer_id,
             claimed_at = EXCLUDED.claimed_at`,
      [
        session.anonymousProjectId,
        session.browserTokenHash,
        session.createdAt,
        session.lastSeenAt,
        session.claimedByCustomerId ?? null,
        session.claimedAt ?? null
      ]
    );
  }

  async getSession(anonymousProjectId: string): Promise<AnonymousSession | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM flo_sessions WHERE anonymous_project_id = $1`, [anonymousProjectId]);
    return rows[0] ? toSession(rows[0]) : undefined;
  }

  async getSessionByTokenHash(browserTokenHash: string): Promise<AnonymousSession | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM flo_sessions WHERE browser_token_hash = $1`, [browserTokenHash]);
    return rows[0] ? toSession(rows[0]) : undefined;
  }

  async saveProject(project: Project): Promise<void> {
    await this.pool.query(
      `INSERT INTO flo_projects (project_id, owner, child_profile_ids, book_ids, latest_activity_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id) DO UPDATE
         SET owner = EXCLUDED.owner,
             child_profile_ids = EXCLUDED.child_profile_ids,
             book_ids = EXCLUDED.book_ids,
             latest_activity_at = EXCLUDED.latest_activity_at`,
      [project.projectId, JSON.stringify(project.owner), JSON.stringify(project.childProfileIds), JSON.stringify(project.bookIds), project.latestActivityAt]
    );
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const { rows } = await this.pool.query(`SELECT * FROM flo_projects WHERE project_id = $1`, [projectId]);
    return rows[0] ? toProject(rows[0]) : undefined;
  }

  /** The owning project for a session — how every authenticated request finds its scope. */
  async getProjectByOwner(anonymousProjectId: string): Promise<Project | undefined> {
    const { rows } = await this.pool.query(
      `SELECT * FROM flo_projects WHERE owner ->> 'anonymousProjectId' = $1 ORDER BY latest_activity_at DESC LIMIT 1`,
      [anonymousProjectId]
    );
    return rows[0] ? toProject(rows[0]) : undefined;
  }

  /** Appends ids to a project's list columns without the caller re-reading it first. */
  async addToProject(projectId: string, patch: { childProfileIds?: string[]; bookIds?: string[]; latestActivityAt?: string }): Promise<void> {
    await this.pool.query(
      `UPDATE flo_projects
          SET child_profile_ids = child_profile_ids || $2::jsonb,
              book_ids = book_ids || $3::jsonb,
              latest_activity_at = COALESCE($4, latest_activity_at)
        WHERE project_id = $1`,
      [
        projectId,
        JSON.stringify(patch.childProfileIds ?? []),
        JSON.stringify(patch.bookIds ?? []),
        patch.latestActivityAt ?? null
      ]
    );
  }
}

type Row = Record<string, unknown>;

function toSession(row: Row): AnonymousSession {
  return {
    anonymousProjectId: String(row.anonymous_project_id),
    browserTokenHash: String(row.browser_token_hash),
    createdAt: String(row.created_at),
    lastSeenAt: String(row.last_seen_at),
    ...(row.claimed_by_customer_id ? { claimedByCustomerId: String(row.claimed_by_customer_id) } : {}),
    ...(row.claimed_at ? { claimedAt: String(row.claimed_at) } : {})
  };
}

function toProject(row: Row): Project {
  return {
    projectId: String(row.project_id),
    owner: row.owner as Project["owner"],
    childProfileIds: (row.child_profile_ids ?? []) as string[],
    bookIds: (row.book_ids ?? []) as string[],
    latestActivityAt: String(row.latest_activity_at)
  };
}
