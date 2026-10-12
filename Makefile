# For Little One — local development.
#
#   make setup   one-time: install deps, start Postgres/Redis, migrate, seed, mint key
#   make dev     run everything; open http://localhost:5173; Ctrl-C stops all
#
# Processes under `make dev`:
#   commerce  Medusa sandbox            :9000  (Path B storage, cart, checkout)
#   api       Path A Hono API           :8787  (flo_slice2 DB; migrates on boot)
#   worker    Path A concept/story loop        (same DB as api)
#   web       Vite                      :5173  (Path B /api functions in-process,
#                                               other /api/* proxied to :8787)
#   editor    Gemini image editor       :8788  (only when GEMINI_API_KEY is set)
#
# Story text for Path A defaults to the free deterministic provider; use
# `make dev FLO_STORY_PROVIDER=gemini` (needs GEMINI_API_KEY) for live text.
#
# Everything here is the LOCAL sandbox (COMMERCE_SANDBOX=true, synthetic approvals,
# fake printer). Nothing in this file talks to shared or production infrastructure.

SHELL := /bin/bash
COLIMA_PROFILE ?= flo-commerce
COMPOSE := docker-compose -f apps/commerce/compose.yaml
COMMERCE := npm run --workspace @for-little-ones/commerce-app
WEB := npm run --workspace @for-little-ones/web
SLICE2_DB := postgres://commerce:commerce_local@localhost:5434/flo_slice2
FLO_STORY_PROVIDER ?= example
# Server-only credential shared by Medusa and the /api functions (story save, page
# corrections). Local value only; deployed hosts bind it from Secret Manager.
export CREATION_SERVICE_SECRET ?= local-creation-service-secret
# GEMINI_API_KEY from the shell, else from the root .env.local (never from .env).
GEMINI_API_KEY ?= $(shell grep -sE '^GEMINI_API_KEY=' .env.local | tail -1 | cut -d= -f2-)

.DEFAULT_GOAL := help
.PHONY: help setup install build docker infra-up infra-down infra-wait db migrate seed key doctor \
        dev commerce api worker web editor sandbox test typecheck check logs psql reset

help: ## Show this help
	@awk 'BEGIN{FS=":.*## "} /^[a-z-]+:.*## /{printf "  \033[36m%-11s\033[0m %s\n",$$1,$$2}' $(MAKEFILE_LIST)

# ---------- one-time setup ----------

setup: install build infra-up db migrate seed key doctor ## Install, start infra, migrate, seed, mint publishable key
	@echo; echo "Ready. Run: make dev  →  http://localhost:5173"

install: ## npm install (workspaces)
	npm install

build: ## Build domain/providers dist (api, worker and /api functions import it)
	npm run build:node-packages

docker: ## Start the colima VM if Docker is not reachable
	@docker info >/dev/null 2>&1 || colima start --profile $(COLIMA_PROFILE)

infra-up: docker ## Start local Postgres (:5434) + Redis (:6381)
	$(COMPOSE) up -d
	@$(MAKE) --no-print-directory infra-wait

infra-wait:
	@printf "waiting for postgres"; for i in $$(seq 1 40); do \
	  $(COMPOSE) exec -T postgres pg_isready -U commerce -d commerce >/dev/null 2>&1 && { echo " ok"; exit 0; }; \
	  printf "."; sleep 1; done; echo " timed out"; exit 1

infra-down: ## Stop Postgres + Redis (data volumes kept)
	$(COMPOSE) down

db: ## Create the Path A flo_slice2 database if missing
	@$(COMPOSE) exec -T postgres psql -U commerce -d commerce -tAc "select 1 from pg_database where datname='flo_slice2'" | grep -q 1 \
	  || $(COMPOSE) exec -T postgres createdb -U commerce flo_slice2
	@echo "flo_slice2 database: ok"

migrate: ## Run Medusa migrations
	@test -f apps/commerce/.env || cp apps/commerce/.env.example apps/commerce/.env
	$(COMMERCE) migrate

seed: ## Seed sandbox region/product/tables (idempotent)
	$(COMMERCE) seed

key: ## Ensure apps/web/.env.local has a valid local publishable key
	@./scripts/ensure-local-publishable-key.sh

doctor: ## Check AI credentials
	@if grep -qsE '^(AI_GATEWAY_API_KEY|VERCEL_OIDC_TOKEN)=.' .env.local || [ -n "$$AI_GATEWAY_API_KEY$$VERCEL_OIDC_TOKEN" ]; then \
	  echo "AI gateway (Path B concepts/story): found — an expired VERCEL_OIDC_TOKEN gives 401s; refresh or set AI_GATEWAY_API_KEY"; \
	else echo "AI gateway (Path B concepts/story): MISSING — set AI_GATEWAY_API_KEY in .env.local"; fi
	@if [ -n "$(GEMINI_API_KEY)" ]; then echo "GEMINI_API_KEY (image editor, FLO_STORY_PROVIDER=gemini): found"; \
	else echo "GEMINI_API_KEY (image editor, FLO_STORY_PROVIDER=gemini): not set — optional; add to .env.local"; fi

# ---------- run ----------

dev: build infra-up db key ## Run commerce + api + worker + web (+ editor); Ctrl-C stops all
	@trap 'kill 0' INT TERM EXIT; \
	  ( $(MAKE) --no-print-directory commerce 2>&1 | sed -u 's/^/[commerce] /' ) & \
	  ( $(MAKE) --no-print-directory api      2>&1 | sed -u 's/^/[api]      /' ) & \
	  ( sleep 3; $(MAKE) --no-print-directory worker 2>&1 | sed -u 's/^/[worker]   /' ) & \
	  ( $(MAKE) --no-print-directory web      2>&1 | sed -u 's/^/[web]      /' ) & \
	  if [ -n "$(GEMINI_API_KEY)" ]; then ( $(MAKE) --no-print-directory editor 2>&1 | sed -u 's/^/[editor]   /' ) & fi; \
	  wait

commerce: ## Run only Medusa on :9000
	$(COMMERCE) dev

api: ## Run only the Path A API on :8787
	DATABASE_URL=$(SLICE2_DB) FLO_STORY_PROVIDER=$(FLO_STORY_PROVIDER) GEMINI_API_KEY=$(GEMINI_API_KEY) npm run dev:api

worker: ## Run only the Path A worker
	DATABASE_URL=$(SLICE2_DB) FLO_STORY_PROVIDER=$(FLO_STORY_PROVIDER) GEMINI_API_KEY=$(GEMINI_API_KEY) npm run dev:worker

web: ## Run only the web app on :5173
	$(WEB) dev

editor: ## Run only the local Gemini image editor on :8788
	GEMINI_API_KEY=$(GEMINI_API_KEY) npm run dev:image-editor

sandbox: ## Run the commerce DB-backed acceptance harness
	$(COMMERCE) sandbox

# ---------- quality ----------

typecheck: ## Root typecheck
	npm run typecheck

test: ## Root vitest suite
	npm test

check: typecheck test ## Typecheck + tests (pre-commit gate)

# ---------- utilities ----------

logs: ## Tail Postgres/Redis logs
	$(COMPOSE) logs -f

psql: ## Open psql on the local commerce DB
	$(COMPOSE) exec postgres psql -U commerce -d commerce

reset: ## DESTRUCTIVE: drop local Postgres/Redis volumes, then re-run setup steps
	@read -p "Delete local commerce DB + Redis volumes? [y/N] " a; [ "$$a" = y ]
	$(COMPOSE) down -v
	@$(MAKE) --no-print-directory infra-up db migrate seed key
