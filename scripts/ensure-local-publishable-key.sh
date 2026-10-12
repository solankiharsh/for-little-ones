#!/usr/bin/env bash
# Ensures apps/web/.env.local holds a Medusa publishable key that exists (and is
# not revoked) in the LOCAL commerce database; mints a fresh one otherwise.
# Local sandbox only — never point this at a shared database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB_ENV="$ROOT/apps/web/.env.local"
COMPOSE=(docker-compose -f "$ROOT/apps/commerce/compose.yaml")

touch "$WEB_ENV"
current="$(grep -E '^VITE_MEDUSA_PUBLISHABLE_KEY=' "$WEB_ENV" | tail -1 | cut -d= -f2- || true)"

if [[ -n "$current" ]]; then
  valid="$("${COMPOSE[@]}" exec -T postgres psql -U commerce -d commerce -tAc \
    "select count(*) from api_key where token = '${current//\'/}' and revoked_at is null and deleted_at is null" 2>/dev/null || echo 0)"
  if [[ "${valid//[[:space:]]/}" == "1" ]]; then
    echo "publishable key: ok"
    exit 0
  fi
fi

echo "publishable key: missing or stale — minting a new one"
key="$(cd "$ROOT" && npm run --silent sandbox-config --workspace @for-little-ones/commerce-app 2>/dev/null \
  | grep -o '"publishableKey":"[^"]*"' | tail -1 | cut -d'"' -f4)"
[[ -n "$key" ]] || { echo "could not mint a publishable key (did seed run?)" >&2; exit 1; }

grep -vE '^(VITE_MEDUSA_PUBLISHABLE_KEY|VITE_MEDUSA_URL)=' "$WEB_ENV" > "$WEB_ENV.tmp" || true
{ cat "$WEB_ENV.tmp"; echo "VITE_MEDUSA_URL=http://localhost:9000"; echo "VITE_MEDUSA_PUBLISHABLE_KEY=$key"; } > "$WEB_ENV"
rm -f "$WEB_ENV.tmp"
echo "publishable key: written to apps/web/.env.local"
