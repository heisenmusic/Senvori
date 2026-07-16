# Release Notes

> ## Post-v0.1.0 addendum — Programming foundation (Sprint 06 · unreleased)
>
> **Date:** 2026-07-16 · **Type:** Feature increment on the trunk — **not** a versioned
> release (see `CHANGELOG.md` → Unreleased). **Trunk:** `claude/senvori-core-domains-w10xi8`.
> **Final validated commit:** `5256aa4`. **CI:** run **#13** green — `verify` + `docker`.
>
> The first end-to-end business capability of Senvori: a **Programming** domain a
> non-technical user can drive from create → configure → **day preview** → publish →
> audit. Deterministic compiler + immutable versions + RBAC/RLS/transactional audit
> (F1–F4), a typed SDK (`client.programming.*`, F5), the "Programação" dashboard with
> the day-preview timeline in pt-BR/en-US/es-ES (F6), and a real-Postgres end-to-end
> flow (F7). **137 tests** (API 93 · SDK 22 · Dashboard 22); lint/format/typecheck/build
> and the CI Docker image build all green. Additive only — **no schema/migration change**
> (`0006` unchanged). **Deferred to Sprint 07:** the Intelligent Programming Engine
> (cross-day fatigue, advanced rotation, paired-track avoidance, AI personalization).
>
> ---

# Release Notes — Senvori v0.1.0

**Date:** 2026-07-16 · **Type:** Foundation / platform consolidation (internal, not
customer-facing) · **Trunk:** `claude/senvori-core-domains-w10xi8` (promote to `main`).

## Summary

v0.1.0 turns a set of divergent branches into **one consolidated, production-ready
foundation**. It adds no customer-visible features by design — its job is to remove
structural risk before the core business domains are built.

## Highlights

1. **One trunk, no lost code.** The Catalog & Media backend (previously stranded on an
   unmerged branch) is now merged with the Product Specification into a single branch.
   The merge was clean (disjoint files), and every quality gate is green on the result.
2. **The API is production-ready.** Liveness/readiness probes, graceful drain-then-shutdown,
   security headers, CORS, per-IP rate limiting, response compression, and structured
   logging with request/correlation IDs — verified by booting the built server.
3. **One-command local platform.** `docker compose up` brings up Postgres, Redis, the API
   (migrated automatically), and the Dashboard, wired by readiness healthchecks.
4. **CI builds and ships images.** Lint → typecheck → tests → build → Docker build →
   artifact; any failure fails the pipeline.
5. **Operational docs.** Environment reference, deploy/rollback runbook, backup & DR plan,
   observability integration guide, and a live project-maturity matrix.

## Verification

| Gate                                     | Result        |
| ---------------------------------------- | ------------- |
| typecheck / lint                         | 10/10 · 10/10 |
| build                                    | 6/6           |
| integration tests (real Postgres)        | **62/62**     |
| migrations (clean + existing DB)         | 0000 → 0005   |
| docker compose config                    | valid         |
| smoke boot (health, headers, request-id) | OK            |

## Upgrade / operate

See `docs/DEPLOY.md`. Migrations are forward-only (`drizzle-kit migrate`); deploy is
rolling and drains via readiness.

## Known limitations (honest)

- `main` not yet created on origin (branch policy); promotion is a one-command step
  documented in `docs/CONSOLIDATION.md`.
- Docker image build / real deploy not exercised in-sandbox (validated via compose
  config + local build/test); CI exercises the image build.
- Rate limiting is in-memory (single instance); Redis-backed is the production upgrade.
- Observability (OTEL/Sentry/Prometheus/Grafana/Uptime Kuma) is prepared, not wired.
- 12 business-domain modules (Campaigns, Scheduling, Fleet, Player, Analytics, Retail
  Media, Marketplace, Billing, AI, …) are still stubs — the next sprints.

## Next

Sprint 06 (Programming foundation) is complete on the trunk — see the addendum above.
**Sprint 07 — Intelligent Programming Engine** is next, to begin only under a new Master
Prompt. See `docs/PROJECT_MATURITY.md` and `docs/PROGRAMMING_UX.md`.
