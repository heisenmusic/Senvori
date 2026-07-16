# Changelog

All notable changes to Senvori. Format based on [Keep a Changelog](https://keepachangelog.com/);
versioning is [SemVer](https://semver.org/). Dates are UTC.

## [0.1.0] — 2026-07-16

First consolidated foundation. Not a customer-facing release: it establishes a single
trunk, production-readiness in the API, and the operational docs required before the
core business domains (Campaigns, Scheduling, Fleet, …) are built.

### Added
- **Production readiness (API):** liveness (`/v1/health/live`), readiness with DB probe
  (`/v1/health/ready`, 503 while draining/DB down), graceful drain-then-shutdown on
  SIGTERM/SIGINT, security headers (`@fastify/helmet`), response compression
  (`@fastify/compress`), per-IP rate limiting (`@fastify/rate-limit`, health-exempt),
  structured JSON logging (pino) with request/correlation IDs (`x-request-id` honoured
  and echoed).
- **Env contract:** `LOG_LEVEL`, `TRUST_PROXY`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW`,
  `SHUTDOWN_GRACE_MS` added and validated at boot; full reference in `docs/ENVIRONMENT.md`.
- **Docker:** `docker compose` now brings up Postgres + Redis + API + Dashboard with a
  one-shot `migrate` init service and readiness-based healthcheck; documented `worker`
  seam behind the `workers` profile.
- **CI:** Docker image build + artifact job, gated on lint/typecheck/test/build.
- **Docs:** `CONSOLIDATION.md`, `ENVIRONMENT.md`, `OBSERVABILITY.md`, `BACKUP.md`,
  `DEPLOY.md`, `PROJECT_MATURITY.md`, `CHANGELOG.md`, `RELEASE_NOTES.md`.

### Changed
- **Repository consolidation:** merged the Catalog & Media foundation
  (`catalog-foundation`) into the trunk together with the Product Specification (05A),
  forming a single source of truth. Clean merge, no conflicts, no files lost.

### Foundation carried in (previous sprints, now unified on one branch)
- Identity + Tenancy runtime: RLS FORCE + non-owner NOBYPASSRLS app role, hierarchical
  RBAC (deny-by-default), transactional audit, Better Auth (organization plugin),
  AsyncLocalStorage tenant context.
- Catalog & Media: storage abstraction (local FS + Cloudflare R2), upload→confirm→process
  state machine, in-process processing worker, migration `0005`.
- `@senvori/contracts` (Zod) + `@senvori/sdk` (typed clients) + `@senvori/ui` (design
  tokens & components); Next.js dashboard (login, units, library; pt-BR/en-US/es-ES).
- Product Specification (05A): 32 frozen docs (philosophy, language, IA, design system,
  13 screen specs, rules, edge cases, QA, roadmap, decision log).

### Verified
- typecheck 10/10 · lint 10/10 · build 6/6 · integration tests **62/62** (real Postgres)
  · migrations 0000→0005 on clean + existing DB · `docker compose config` valid · smoke
  boot of the built API (health, security headers, request-id) OK.

### Known limitations
- `main` not yet created on origin (branch policy this session); trunk is
  `claude/senvori-core-domains-w10xi8`.
- Docker image build / deploy not exercised in a real environment (compose config only).
- Rate limit is in-memory (single-instance); Redis-backed store is the production upgrade.
- Observability (OTEL/Sentry/Prometheus) prepared, not wired.
- 12 business-domain modules remain stubs.
