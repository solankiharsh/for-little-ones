# Spike A — Durable Execution Substrate

Compare the two candidate classes for the **durable execution substrate** (D019
`DurableExecutionContract`, F-028/F-010) by driving the **exact same
crash/recovery + retry-exhaustion + cancellation scenario** through:

| Candidate | Class | Backing stores |
|---|---|---|
| **pg-boss** 12.33.3 | PostgreSQL-backed job queue | PostgreSQL only |
| **BullMQ** 6.3.8 + ioredis 6.0.0 | Redis-backed job queue | PostgreSQL (app) + Redis |

Both decode to the same `src/backend.ts` `SpikeBackend`, run the same
`src/harness.ts` scenarios, write the same markers, and pass the **same**
assertions in `test/shared.ts`. The only difference is the substrate.

## D019 contract → substrate mapping

| Contract obligation | pg-boss | BullMQ |
|---|---|---|
| enqueue work | `boss.send(queue, data)` (singleton by operationKey) | `queue.add(name, data, { jobId: operationKey })` |
| durable state | pg-boss `job` table row | Redis job hash |
| per-unit state | `job.data` + state (active/completed/failed/…) | `job.data` + state (waiting/active/completed/failed/…) |
| claim/lease | `boss.fetch` — **does not** lock longer than in-flight; supervisor reclaims after `expireInSeconds` | worker acquisition holds a Redis lock for `lockDuration`; stalled checker resets stale locks every `stalledInterval` |
| reclaim abandoned work | supervisor (auto on each instance) | stalled checker (auto) |
| retry + delay | `retryLimit`, `retryDelay`, `retryBackoff` on the queue | `attempts`, `backoff: { type: "exponential", delay }` |
| cancellation | `boss.cancel(queue)` → jobs become `cancelled` | `job.remove()` → job deleted from Redis |
| dead-letter | **native DLQ** — exhausted retries are routed to the configured DLQ queue | **none** — exhausted jobs land in the Redis `failed` set; a drainer/job over the failed set + app ledger is required |
| concurrency control | queue singleton contention + app `CONCURRENCY=1` (rely on the DB) | `concurrency: 1` worker option (Redis lock) |
| progress observation | `inspectBook` via `findJobs` + `getQueue` counters; pg-boss ships @pg-boss/dashboard | `inspectBook` via `queue.getJob`; Redis-native inspection |
| provider idempotency | stable `providerIdempotencyKey` on the payload through `sourceRetryCount` only (job `id` changes on re-send) | contract-level idempotency table in the app DB (shared with pg-boss) |

## Configuration: spike vs production defaults

The spike deliberately shortens timers so a scenario runs in seconds. Production
defaults (listed next to each) are slower and safer — do not copy the spike
values.

| Setting | Spike value | Production default |
|---|---|---|
| pg-boss expireInSeconds | **6** | 900 (15 min) |
| pg-boss supervise/monitor interval | **2 s** | 60 s |
| pg-boss retry | retryLimit 2, retryDelay 1 s, retryBackoff | subject to F-028 rules |
| pg-boss retention | retentionSeconds 3600 / deleteAfterSeconds 3600 | longer (observability/audit) |
| BullMQ lockDuration | **10000 ms** | 30000 ms default |
| BullMQ stalledInterval / maxStalledCount | **5000 ms / 3** | 30000 ms / 1 |
| BullMQ retry | attempts 3, exponential backoff 1 s | subject to F-028 rules |
| BullMQ job retention | removeOnComplete/Fail after 1 h | longer (observability) |

## Running it

No Docker required on this machine (colima/brew are unavailable here), so the
spike runs real binaries in userspace:

```sh
npm install
npm run infra:local   # embedded PostgreSQL 18.4 + real Redis; Ctrl-C to stop
npm run typecheck
npm test              # 8 tests: 4 per candidate
```

`npm run infra:up` / `infra:down` (`infra/compose.yaml`) are the equally-valid
Docker path for machines that have Docker: same ports (`5432`, `6379`), same
credentials (`spike`/`spike`, db `durable_spike`).

## The scenario

1. enqueue `story` → a worker completes it (marker `story-completed`).
2. enqueue pages 1–8 (page 5 has `crashPoint: "after-provider-accept"`; page 7
   always fails QA). Concurrency 1.
3. pages 1–4 commit normally; page 5 reaches the provider, is accepted, then
   HOLDS on a gate.
4. the harness **SIGKILLs the worker process** (a real proc kill — no local
   commit ever happens; the provider boundary is crossed but nothing is durably
   committed).
5. worker-b starts; the **substrate alone** must reclaim the abandoned page-5
   lease. The provider returns `cached: true` with the **same**
   `providerRequestId` (no duplicate spend). The gate releases; the re-run
   commits; pages 6 and 8 finish.
6. page 7 exhausts its retries → terminal state **and is visible**:
   pg-boss dead-letter queue / BullMQ failed set.
7. a cancellation scenario (no workers) verifies enqueued work stops cleanly.

## Result (measured 2026-09-22, 3× consecutive green runs, latest numbers)

| Axis | pg-boss | BullMQ |
|---|---|---|
| crash reclaim (worker killed while holding page 5) | 8,890 ms | 15,199 ms |
| kill → page-5 committed (recovery-to-commit) | 8,922 ms | 15,245 ms |
| page-5 provider spend (without/with reclaim) | 1 (`cached=true`) | 1 (`cached=true`) |
| duplicate spend prevented (page 5) | yes, providerRequestId stable | yes, providerRequestId stable |
| unique units committed / provider spend total | 7 / 7 | 7 / 7 |
| page-7 attempts before terminal | 3 | 3 |
| page-7 terminal visibility | DLQ row (`generation-bad`, `sourceId` preserved) | `failed` set entry |
| substrate state of reclaimed page 5 | attempts counted 2 | attempts counted 1 (stalled→waiting does not bump attempts) |
| provably stops on cancel | `cancelled` rows | job removed (no record) |

Reclaim latency difference is exactly the lease design: pg-boss expireInSeconds
6 s + monitor ~2 s ≈ 8.9 s; BullMQ lockDuration 10 s + stalled poll 5 s ≈ 15 s.
Both do the job; pg-boss reclaims sooner with a shorter expiry, BullMQ reclaims
on a fixed lock round-trip.

Closing note on exactly-once: pg-boss README advertises **"exactly-once
delivery"** — the spike does **not** verify or rely on that claim. Recovery of
the crash boundary is guaranteed by **provider idempotency** (stable
`providerRequestId`), not by any substrate guarantee. `OPEN` outranks a fake
claim.