# Changelog

All notable changes to Senvori. Format based on [Keep a Changelog](https://keepachangelog.com/);
versioning is [SemVer](https://semver.org/). Dates are UTC.

## [Unreleased]

### Added — Intelligent Programming Engine (Sprint 07)

Four deterministic intelligence layers on top of the Sprint 06 compiler, which is
bumped to **2.0.0**. Each is opt-in and defaults to no-op; the compiler stays a
pure function (no DB/HTTP/clock/random), so the reproducibility proof (same
inputs ⇒ same `planHash`) is untouched — the "learning" happens upstream and is
only *applied* here.

- **Cross-day fatigue:** a per-candidate `recentPlays` signal de-weights tracks
  played heavily on recent days (`effectiveWeight ÷= 1 + weightPenalty·recentPlays`).
- **Advanced rotation categories:** a category gap (base + per-category overrides)
  keeps tracks sharing a genre/tag apart; relaxable, with a `category_gap_relaxed`
  warning. Categories come from `tracks.genres`. New relaxation order:
  strict → artist → category → track → fallback.
- **Paired-track avoidance:** `avoidPairs` keep configured asset pairs apart — a
  hard constraint at every relaxation level, counted in `stats.engine.avoidPairBlocks`.
- **Learned personalization:** an upstream `affinity ∈ [0,1]` score modulates
  effective weight (`×(1 + strength·(2·affinity − 1))`), applied deterministically.
- **Explainability:** per-item reasons gain engine bits (`audience-preferred`,
  `rotation-balanced across days`, …) and the plan reports a `stats.engine`
  block (`fatigueApplied`, `personalizationApplied`, `categoriesApplied`,
  `avoidPairBlocks`).
- **Persistence & surface:** migration `0007_programming_engine_policy` (additive,
  nullable) adds `min_category_gap_minutes`, `fatigue_weight_penalty`,
  `personalization_strength` to `rotation_policies`; contracts, SDK types and the
  Dashboard rotation-rules editor (pt-BR/en-US/es-ES) carry the knobs (`0` ⇒ off).
- **Docs:** `PROGRAMMING_ENGINE.md`; `PROGRAMMING_COMPILER.md` cross-reference.

Verified: format · lint · typecheck · build green; **150 tests** (API 106 on real
Postgres — +12 engine unit, +1 policy round-trip; SDK 22 · Dashboard 22).
**Not a release.**

### Added — Programming foundation (Sprint 06: F1–F7)

- **Deterministic compiler** (`apps/api/src/modules/playlists/compiler/`, pure): seed +
  PRNG, IANA/DST-correct timezone resolution, rotation rules (track/artist gap),
  progressive relaxation, safety fallback, silence, bounded iterations, warnings,
  explainability and a canonical plan hash. 16 unit tests.
- **Migration 0006** (additive): `plan_hash`, `compiler_version`, `published_by` on
  `playlist_versions`. Validated clean + existing DB.
- **Programming API** (`/v1/programs`): program CRUD, items (incl. `GET :id/items` with
  Library metadata), `publishedVersion` on the program DTO, tenant rotation policy,
  deterministic **preview** (ephemeral), **immutable version publish** (plan hash +
  publisher), version listing, scope **assignment**. Tenant from context; RLS + RBAC
  deny-by-default; transactional audit on every mutation. Contracts + concrete
  `playlists:program:*` / `scheduling:program:assign` permissions.
- **SDK** (`@senvori/sdk` · `client.programming.*`): typed methods for programs,
  content, rotation policy, cancellable **preview**, **versions** and **assignments**;
  shared contracts, typed errors (401/403/404/409/422). 22 tests.
- **Dashboard "Programação"** (`/programs`): list, staged create, detail (edit,
  content, rules, scope), **Day preview** timeline (DST-correct, translated warnings,
  abbreviated identifier), conscious **publish** (accessible modal) and **version
  history**. i18n pt-BR/en-US/es-ES, accessible, design system reused. 22 tests.
- **End-to-end flow** (§26, real Postgres): create → content → rules → assign(unit) →
  preview (timezone validated) → same input ⇒ same hash + sequence → publish →
  immutability → history → transactional audit.
- **Docs:** MEDIA_EXECUTION_ARCHITECTURE (+7 ADRs), PROGRAMMING_COMPILER,
  PROGRAMMING_DOMAIN, PROGRAMMING_UX (SDK + Dashboard), sprint-06 pre-implementation
  audit.

Verified: lint · format · typecheck · build green; **137 tests** (API 93 on real
Postgres · SDK 22 · Dashboard 22). **Not a release.** The deferred items
(cross-day fatigue, advanced rotation categories, paired-track avoidance,
learned/AI personalization) are delivered in Sprint 07 above.

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
