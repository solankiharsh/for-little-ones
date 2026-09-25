/**
 * Shared "application database" state for the pg-boss runtime tests: the
 * simulated external provider's idempotency cache, the per-page run ledger and
 * the canonical page state. Mirrors the durable-execution spike's app state so
 * crash-recovery scenarios behave identically (idempotent replays, no duplicate
 * spend) whether the worker lives in-process or in a killed subprocess.
 */
import pg from "pg";

export interface ProviderOutcome {
  cached: boolean;
  providerRequestId: string;
  artifactUrl: string;
}

export interface ProviderRecord {
  providerRequestId: string;
  artifactUrl: string;
}

export interface PageExecutionRow {
  bookId: string;
  pageNumber: number;
  executionId: string;
  workerId: string;
  providerRequestId: string;
}

export interface PageStateRow {
  bookId: string;
  pageNumber: number;
  providerRequestId: string;
  artifactUrl: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class TestAppState {
  private constructor(private readonly pool: pg.Pool) {}

  static async connect(connectionString: string): Promise<TestAppState> {
    const pool = new pg.Pool({ connectionString });
    const state = new TestAppState(pool);
    await state.ensureSchema();
    return state;
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS flo_provider_request (
        idempotency_key text PRIMARY KEY,
        provider_request_id text NOT NULL,
        artifact_url text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS flo_page_execution (
        book_id text NOT NULL,
        page_number int NOT NULL,
        execution_id text NOT NULL,
        worker_id text NOT NULL,
        provider_request_id text NOT NULL,
        started_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (book_id, page_number, execution_id)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS flo_page_state (
        book_id text NOT NULL,
        page_number int NOT NULL,
        provider_request_id text NOT NULL,
        artifact_url text NOT NULL,
        committed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (book_id, page_number)
      )
    `);
  }

  async providerGet(idempotencyKey: string): Promise<ProviderRecord | undefined> {
    const res = await this.pool.query(
      `SELECT provider_request_id, artifact_url FROM flo_provider_request WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      providerRequestId: String(row.provider_request_id),
      artifactUrl: String(row.artifact_url)
    };
  }

  /** The provider's acceptance cache: first call accepts, later calls replay. */
  async providerAccept(idempotencyKey: string, artifactUrl: string): Promise<ProviderOutcome> {
    const existing = await this.providerGet(idempotencyKey);
    if (existing) {
      return { cached: true, ...existing };
    }
    const providerRequestId = `req-${crypto.randomUUID()}`;
    await this.pool.query(
      `INSERT INTO flo_provider_request (idempotency_key, provider_request_id, artifact_url)
       VALUES ($1, $2, $3)`,
      [idempotencyKey, providerRequestId, artifactUrl]
    );
    return { cached: false, providerRequestId, artifactUrl };
  }

  async providerCount(): Promise<number> {
    const res = await this.pool.query(`SELECT count(*)::int AS n FROM flo_provider_request`);
    return res.rows[0]?.n ?? 0;
  }

  async recordPageExecution(
    bookId: string,
    pageNumber: number,
    executionId: string,
    workerId: string,
    providerRequestId: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO flo_page_execution (book_id, page_number, execution_id, worker_id, provider_request_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (book_id, page_number, execution_id) DO NOTHING`,
      [bookId, pageNumber, executionId, workerId, providerRequestId]
    );
  }

  async commitPageState(bookId: string, pageNumber: number, outcome: ProviderOutcome): Promise<void> {
    await this.pool.query(
      `INSERT INTO flo_page_state (book_id, page_number, provider_request_id, artifact_url)
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
        `SELECT book_id, page_number, execution_id, worker_id, provider_request_id
         FROM flo_page_execution WHERE book_id = $1 AND page_number = $2 ORDER BY started_at`,
        [bookId, pageNumber]
      );
      return this.toExecutions(res);
    }
    const res = await this.pool.query(
      `SELECT book_id, page_number, execution_id, worker_id, provider_request_id
       FROM flo_page_execution WHERE book_id = $1 ORDER BY page_number, started_at`,
      [bookId]
    );
    return this.toExecutions(res);
  }

  async getPageState(bookId: string, pageNumber: number): Promise<PageStateRow | undefined> {
    const res = await this.pool.query(
      `SELECT book_id, page_number, provider_request_id, artifact_url
       FROM flo_page_state WHERE book_id = $1 AND page_number = $2`,
      [bookId, pageNumber]
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return {
      bookId: String(row.book_id),
      pageNumber: Number(row.page_number),
      providerRequestId: String(row.provider_request_id),
      artifactUrl: String(row.artifact_url)
    };
  }

  private toExecutions(res: pg.QueryResult): PageExecutionRow[] {
    return res.rows.map((r) => ({
      bookId: String(r.book_id),
      pageNumber: Number(r.page_number),
      executionId: String(r.execution_id),
      workerId: String(r.worker_id),
      providerRequestId: String(r.provider_request_id)
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Simulated illustration vendor with an idempotency cache backed by Postgres. */
export class TestProvider {
  constructor(
    private readonly appState: TestAppState,
    private readonly opts: { callDelayMs?: number } = {}
  ) {}

  async call(idempotencyKey: string): Promise<ProviderOutcome> {
    const existing = await this.appState.providerGet(idempotencyKey);
    if (existing) {
      return { cached: true, providerRequestId: existing.providerRequestId, artifactUrl: existing.artifactUrl };
    }
    await sleep(this.opts.callDelayMs ?? 150);
    return this.appState.providerAccept(
      idempotencyKey,
      `https://vendor.example/artifacts/${idempotencyKey.replace(/:/g, "-")}.webp`
    );
  }
}