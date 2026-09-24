# Commerce sandbox deployment

`cloudbuild-commerce.yaml` builds `Dockerfile.commerce` and publishes to Artifact
Registry. `deploy-commerce.py` tags the image with the full Git commit and deploys
that image to Cloud Run. Commit first; real runs reject a dirty checkout.
Python 3, Git and authenticated `gcloud` are required. Docker is needed only for
local container builds.

## One-time setup

The existing deployment is project `cloak-500012`, region `us-central1`, Artifact
Registry Docker repository `flo-commerce`, service `flo-commerce-backend`.
For another project, enable Cloud Build, Artifact Registry, Cloud Run and Secret
Manager, create a Docker repository in the chosen region, and provision Postgres
and Redis/Valkey. The build identity needs Artifact Registry writer and logging
permissions. The deployer needs Cloud Run deployment permission and permission
to use the runtime service account. The runtime account needs Secret Manager
access to these four secrets:

- `commerce_DB_URL`: external PostgreSQL URL with `sslmode=verify-full` (or
  `require`, preserving current driver behavior).
- `commerce_REDIS_URL`: external TLS `rediss://` URL, including credentials.
- `commerce_JWT_SECRET` and `commerce_COOKIE_SECRET`: random private values.

Provision values directly in Secret Manager. Never put them into Cloud Build
substitutions, Docker build arguments, command history or tracked environment
files. Bindings use `latest`, so secret versions remain an explicit operational
input, separate from the commit-tagged application image.

The runtime requires `COMMERCE_SANDBOX=true` and `NODE_ENV=development` and
rejects production mode. It still uses synthetic approvals and fake printing.

## Build, deploy and verify

Run from a clean checkout; the scripts locate the repository themselves:

```sh
python3 scripts/probe-secrets.py --project cloak-500012
python3 scripts/deploy-commerce.py deploy --project cloak-500012 \
  --service-account 597538231187-compute@developer.gserviceaccount.com --dry-run
# Remove --dry-run to build and deploy.
```

`--region`, `--repository` and `--service` override the existing deployment's
names. `build` only publishes the image. Normal `deploy` builds then deploys,
fails immediately if either step fails, and never runs migrations or seeding.
It preserves service IAM; a new service is private until access is configured.
The existing storefront service already has public invocation enabled.

The shared server/worker process uses port 9000, 2 CPUs, 3 GiB memory, at least
one instance and always-allocated CPU so background events/jobs can run without
HTTP traffic. The maximum remains 3 instances to match the existing service;
monitor Redis connections (the current free instance allows 50).

For a fresh database, build the image, then explicitly run the one-off jobs
before deploying traffic:

```sh
python3 scripts/deploy-commerce.py build --project cloak-500012
python3 scripts/deploy-commerce.py migrate --project cloak-500012 \
  --service-account 597538231187-compute@developer.gserviceaccount.com
python3 scripts/deploy-commerce.py seed --project cloak-500012 \
  --service-account 597538231187-compute@developer.gserviceaccount.com
# Then run deploy with the same arguments and Git commit.
```

Jobs use one task, no automatic retries and a 10-minute timeout. For existing
databases, run migrations only when required, and seed only intentionally.
Check the deployed service's `/health`, then inspect that revision's logs for
`ETIMEDOUT`, `Connection is closed`, the workflow URL deprecation and eviction
warnings. HTTP health alone does not prove background events are delivered.

## Redis startup and eviction policy

`medusa-config.ts` uses `redis.redisUrl` for the workflow engine and a 30-second
connection timeout for both Redis modules (including BullMQ's duplicated
worker connection). A regression probe reproduced a healthy initial connection
followed by `ETIMEDOUT`, `Connection is closed` and an undelivered event when
synchronous boot work stalled the worker TLS handshake for 12 seconds. The
30-second setting passes the same probe. This demonstrates the failure mechanism;
it does not establish that CPU delay was the only cause of the deployed incident.

The provider setting is separate from app configuration: in Render, open
`flo-commerce-redis` → Info → Maxmemory Policy → **noeviction**. This was applied
on 2026-09-24 to `red-daprjmvlk1mc73cm59lg`. Changing it restarts the instance.
The free plan has no persistence; `noeviction` prevents memory-pressure eviction,
but cannot preserve jobs across provider restarts. Local Compose explicitly uses
`noeviction` too. See [Render's queue recommendation](https://render.com/docs/key-value#maxmemory-policy)
and [Medusa's Redis module options](https://docs.medusajs.com/resources/architectural-modules/event/redis).

## Checks

```sh
python3 -m unittest discover -s scripts/tests -v
npm run typecheck
npm test
npm run build --workspace @for-little-ones/commerce
npm run typecheck --workspace @for-little-ones/commerce-app
# Sandbox TLS Redis only: sends a synthetic event on a unique queue, then removes it.
node scripts/tests/redis-startup.cjs --project cloak-500012
# Or provide TEST_REDIS_URL in the environment; do not paste credentials into commands.
# --baseline deliberately tests ioredis's old timeout and should fail.
docker build -f Dockerfile.commerce -t flo-commerce:check .
```

`probe-secrets.py` checks URL structure/TLS and whether secrets can be fetched;
it does not prove database connectivity. `peek-urls.py` is a compatibility
wrapper for that probe. Neither prints credentials, hosts, paths or query values.
Local `.env` files remain ignored by Git, Docker and Cloud Build; only
`.env.example` templates belong in Git. Docker builds use disposable placeholders
on the build command only, and the runtime image has no credential defaults.
