/**
 * Shared "application database" state for the spike.
 *
 * This is the canonical book-side state both candidates share (the app DB a real
 * product would have). It holds:
 *   - the simulated external provider's idempotency cache (spike_provider_request);
 *   - the app's page ledger: one row per page-execution run (spike_page_execution);
 *   - the app's canonical page state / "local commit" target (spike_page_state).
 *
 * Both candidates use Postgres for this state. The candidates differ ONLY in where
 * the durable queue lives: inside the same Postgres (pg-boss) vs a separate Redis
 * (BullMQ). Keeping app state identical is what makes the comparison fair.
 */
import pg from "pg";

export interface ProviderRecord {
  providerRequestId: string;
  artifactUrl: string;
  createdCount: number;
}

export interface ProviderOutcome {
  cached: boolean;
  providerRequestId: string;
  artifactUrl: string;
}

export interface PageExecutionRow {
  bookId: string;
  pageNumber: number;
  executionId: string;
  workerId: string;
  providerRequestId: string;
  startedAt: string;
}

export interface PageStateRow {
  bookId: string;
  pageNumber: number;
  providerRequestId: string;
  artifactUrl: string;
  committedAt: string;
}

export class SpikeAppState {
  private constructor(private readonly pool: pg.Pool) {}

  static async connect(connectionString: string): Promise<SpikeAppState> {
    const pool = new pg.Pool({ connectionString });
    const state = new SpikeAppState(pool);
    await state.ensureSchema();
    return state;
  }

  get providerCache(): pg.Pool {
    return this.pool;
  }

  /** Idempotent DDL only — safe for every worker subprocess to call on start. */
  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS spike_provider_request (
        idempotency_key TEXT PRIMARY KEY,
        provider_request_id TEXT NOT NULL,
        artifact_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS spike_page_execution (
        book_id TEXT NOT NULL,
        page_number INT NOT NULL,
        execution_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        provider_request_id TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (book_id, page_number, execution_id)
      );
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS spike_page_state (
        book_id TEXT NOT NULL,
        page_number INT NOT NULL,
        provider_request_id TEXT NOT NULL,
        artifact_url TEXT NOT NULL,
        committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (book_id, page_number)
      );
    `);
  }

  /** Full wipe so each scenario starts from a clean shared store. Harness only. */
  async reset(): Promise<void> {
    await this.pool.query(`DELETE FROM spike_provider_request;`);
    await this.pool.query(`DELETE FROM spike_page_execution;`);
    await this.pool.query(`DELETE FROM spike_page_state;`);
  }

  /**
   * The simulated provider's acceptance cache. Called BY the provider when it
   * accepts a request; queried BY the worker on retries (idempotency key).
   */
  async providerAccept(idempotencyKey: string, artifactUrl: string): Promise<ProviderOutcome> {
    const existing = await this.providerGet(idempotencyKey);
    if (existing) {
      return { cached: true, ...existing };
    }
    const providerRequestId = `req-${crypto.randomUUID()}`;
    await this.pool.query(
      `INSERT INTO spike_provider_request (idempotency_key, provider_request_id, artifact_url)
       VALUES ($1, $2, $3)`,
      [idempotencyKey, providerRequestId, artifactUrl]
    );
    return { cached: false, providerRequestId, artifactUrl };
  }

  async providerGet(idempotencyKey: string): Promise<ProviderRecord | undefined> {
    const res = await this.pool.query(
      `SELECT provider_request_id, artifact_url FROM spike_provider_request WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      providerRequestId: String(row.provider_request_id),
      artifactUrl: String(row.artifact_url),
      createdCount: res.rowCount ?? 0
    };
  }

  async providerCount(): Promise<number> {
    const res = await this.pool.query(`SELECT count(*)::int AS n FROM spike_provider_request`);
    return Number(res.rows[0]?.n ?? 0);
  }

  /** The app ledger: one row per actual handler run of a page unit. */
  async recordPageExecution(
    bookId: string,
    pageNumber: number,
    executionId: string,
    workerId: string,
    providerRequestId: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO spike_page_execution (book_id, page_number, execution_id, worker_id, provider_request_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (book_id, page_number, execution_id) DO NOTHING`,
      [bookId, pageNumber, executionId, workerId, providerRequestId]
    );
  }

  /** The "local commit": applying the provider's output to canonical page state. */
  async commitPageState(bookId: string, pageNumber: number, outcome: ProviderOutcome): Promise<void> {
    await this.pool.query(
      `INSERT INTO spike_page_state (book_id, page_number, provider_request_id, artifact_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (book_id, page_number)
       DO UPDATE SET provider_request_id = EXCLUDED.provider_request_id,
                     artifact_url = EXCLUDED.artifact_url,
                     committed_at = now()`,
      [bookId, pageNumber, outcome.providerRequestId, outcome.artifactUrl]
    );
  }

  async getPageExecutions(bookId: string, pageNumber?: number): Promise<PageExecutionRow[]> {
    if (pageNumber !== undefined) {
      const res = await this.pool.query(
        `SELECT book_id, page_number, execution_id, worker_id, provider_request_id, started_at
         FROM spike_page_execution WHERE book_id = $1 AND page_number = $2 ORDER BY started_at`,
        [bookId, pageNumber]
      );
      return res.rows.map((r) => ({
        bookId: String(r.book_id),
        pageNumber: Number(r.page_number),
        executionId: String(r.execution_id),
        workerId: String(r.worker_id),
        providerRequestId: String(r.provider_request_id),
        startedAt: String(r.started_at)
      }));
    }
    const res = await this.pool.query(
      `SELECT book_id, page_number, execution_id, worker_id, provider_request_id, started_at
       FROM spike_page_execution WHERE book_id = $1 ORDER BY page_number, started_at`,
      [bookId]
    );
    return res.rows.map((r) => ({
      bookId: String(r.book_id),
      pageNumber: Number(r.page_number),
      executionId: String(r.execution_id),
      workerId: String(r.worker_id),
      providerRequestId: String(r.provider_request_id),
      startedAt: String(r.started_at)
    }));
  }

  async getPageState(bookId: string, pageNumber: number): Promise<PageStateRow | undefined> {
    const res = await this.pool.query(
      `SELECT book_id, page_number, provider_request_id, artifact_url, committed_at
       FROM spike_page_state WHERE book_id = $1 AND page_number = $2`,
      [bookId, pageNumber]
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      bookId: String(row.book_id),
      pageNumber: Number(row.page_number),
      providerRequestId: String(row.provider_request_id),
      artifactUrl: String(row.artifact_url),
      committedAt: String(row.committed_at)
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}