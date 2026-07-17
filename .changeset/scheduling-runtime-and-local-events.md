---
"@senvori/contracts": minor
"@senvori/sdk": minor
"@senvori/api": minor
"@senvori/dashboard": minor
---

Scheduling Runtime & Local Events (Sprint 08): published programs become an
**operational timeline** — what plays for a unit at a local date/time, why, and
with which interruptions — with **no audio produced** (Player stays Not
implemented). A pure deterministic resolver
(`unit > group > sync_group > tenant`, then priority, then narrower period, then a
stable id tiebreak) selects the active program and explains it with a structured
reason code; migration `0009` `schedule_assignments` (RLS + FORCE + audit) backs
it. **Local events** — editorial inserts, campaign slots and emergencies
(`insert`/`overlay`/`interrupt`) — layer as deterministic **effective-plan
overlays** with precedence masking and an `emergencyActive` flag; migration `0010`
`local_events` (RLS + FORCE + audit). The **effective plan** separates the shared
sync-group **base plan hash** from the per-unit, per-local-date **effective plan
hash**. Full REST surface under `scheduling:assignment:*`, `scheduling:event:*` and
`scheduling:plan:read`, SDK `SchedulingClient`, a Dashboard Scheduling area with a
resolve preview, and i18n across pt-BR/en-US/es-ES. Covered by pure resolver, pure
local-events, full-day timeline-simulation and real-Postgres integration suites.
**Hard sync enforcement** and **program-level emergency swap** are modelled and
documented but **Prepared** — there is no runtime to execute them yet.
