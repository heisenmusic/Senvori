# Changelog

All notable changes to Senvori. Format based on [Keep a Changelog](https://keepachangelog.com/);
versioning is [SemVer](https://semver.org/). Dates are UTC.

## [Unreleased]

### Added — Historical Programming Runtime (Sprint 07B)

Gives the deterministic engine **operational memory** — the radio no longer
restarts from zero each day — while keeping the compiler a pure function. Three
Sprint 07 "Prepared" capabilities become **Complete**; affinity stays Prepared.

- **Planned history (`buildPlannedHistory`, pure):** deterministically re-compiles
  the program for prior **local dates** (DST-agnostic date math; fatigue OFF ⇒ no
  recursion) to derive `recentPlays`, recent-artist counts and the previous-day
  tail. Named `planned_history` (a projection, **not** Proof-of-Play); a
  `verified_playback_history` provider can slot in later unchanged. `playback_events`
  has no producer and is deliberately not used.
- **Cross-day fatigue — Complete.** `recentPlays` now comes from planned history;
  with a penalty set, heavily-played tracks lose share (proven in a 14-day sim).
- **Cross-day continuity (`carryOver`) — Complete.** The previous day's tail seeds
  the seam with a wall-clock gap (0 for 24 h windows, large for partial ones), so
  a day never opens with yesterday's closing track when the catalog allows.
- **Paired-track avoidance — Complete.** Migration `0008` `rotation_pairs` (RLS +
  FORCE, order-normalised unique index, `a<>b` check, audit cols); REST CRUD under
  `playlists:rotation_pair:*` with transactional audit + `409` on duplicates; SDK
  methods; a Dashboard "Recurring pairs" editor. Active pairs feed preview + publish.
- **Config:** `rotation_policies` gains `history_lookback_days` + `cross_day_continuity`
  (additive; defaults 7 / on). Publish records the history runtime + active pairs in
  the immutable version context and fingerprint. A Dashboard "Programming memory"
  panel with honest copy (planned history ≠ proof of playback). i18n pt/en/es.
- **Docs:** `PROGRAMMING_HISTORY.md`; `PROGRAMMING_ENGINE.md` capability matrix updated.

Closure verification also fixed a determinism defect (active pairs are now loaded
in a stable order so the published `planHash` never depends on physical row order)
and added cross-tenant security tests (no pairing another tenant's asset; no
cross-tenant update/delete) plus DST-boundary and thin-catalog history tests.

Verified: format · lint · typecheck · build green; **195 tests** (API 144 on real
Postgres — pairs CRUD/RLS/RBAC/audit + cross-tenant, history unit incl. DST, 14-day
simulation; SDK 26 · Dashboard 25). **Not a release.** Affinity weighting remains
**Prepared** (no score source); real Proof-of-Play is future work.

### Added — Intelligent Programming Engine (Sprint 07)

The Sprint 06 compiler grew four deterministic capabilities and is bumped to
**2.0.0**. It stays a pure function (no DB/HTTP/clock/random), so the
reproducibility proof (same inputs ⇒ same `planHash`) is untouched. **Honest
scope:** only *advanced rotation categories* is wired end-to-end; the other three
are engine-level and **Prepared** (no production signal/surface yet), deferred to
**Sprint 07B**. The compiler never learns — any signal is computed upstream and
passed in. See `docs/PROGRAMMING_ENGINE.md` for the capability matrix.

- **Advanced rotation categories — Complete.** A category gap (base + per-category
  overrides) keeps tracks sharing a genre apart; relaxable, with a
  `category_gap_relaxed` warning. Wired `tracks.genres` (DB) → migration →
  repository → service → contracts → SDK → Dashboard → compiler, with a
  real-Postgres E2E test. New relaxation order: strict → artist → category →
  track → fallback.
- **Cross-day fatigue — Prepared.** Engine + `fatigueWeightPenalty` knob (persisted,
  editable end-to-end). The per-track `recentPlays` **signal has no source** —
  nothing populates `playback_events`, preview/publish don't query history — so it
  is inert in production. Proven only in simulation.
- **Affinity-aware deterministic weighting — Prepared** (renamed from "learned
  personalization"; there is **no learning**). Engine + `affinityStrength` knob.
  The per-track `affinity` **score has no source**, so inert in production.
- **Paired-track avoidance — Prepared (engine-only).** `avoidPairs` are a hard
  constraint counted in `stats.engine.avoidPairBlocks`, but exist **only** in the
  compiler: no column, contract, endpoint, SDK, Dashboard, or RBAC/RLS/audit.
- **Cross-day seam (`carryOver`) — Prepared (engine primitive).** Seeds the prior
  window's tail so gaps span the day boundary; not yet supplied by the service.
- **Explainability:** per-item reasons gain engine bits; the plan reports a
  `stats.engine` block (`fatigueApplied`, `affinityApplied`, `categoriesApplied`,
  `avoidPairBlocks`) that flags a layer active only when its signal is present.
- **Persistence & surface:** migration `0007_programming_engine_policy` (additive,
  nullable) adds `min_category_gap_minutes`, `fatigue_weight_penalty`,
  `affinity_strength` to `rotation_policies`; contracts, SDK types and the
  Dashboard rotation-rules editor (pt-BR/en-US/es-ES) carry the three knobs.
- **Docs:** `PROGRAMMING_ENGINE.md` (capability matrix + 07B plan);
  `PROGRAMMING_COMPILER.md` cross-reference.

Verified: format · lint · typecheck · build green; **161 tests** (API 117 on real
Postgres — +12 engine unit, +10 cross-day simulation, +2 policy/categories E2E;
SDK 22 · Dashboard 22). **Not a release.** Fatigue, affinity weighting and
paired-track avoidance remain Prepared → **Sprint 07B**.

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
