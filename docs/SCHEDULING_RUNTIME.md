# Scheduling Runtime (Sprint 08 · §6–§8)

> How Senvori turns published programs into an **operational timeline** — what
> should play, where, when and why — without producing any audio. Code:
> `apps/api/src/modules/scheduling/`. The decision core is a pure function
> (`resolver/resolver.ts`, `resolver/local-events.ts`); the service only loads
> data and maps it. Verified by `test/scheduling-resolver.spec.ts`,
> `test/local-events-resolver.spec.ts`, `test/scheduling-timeline.spec.ts` and
> the real-Postgres `test/scheduling.spec.ts`.

## The question this domain answers

Given a **unit**, a **local date** and a **local time**, which published program
plays, why, and with which interruptions? Everything else in the platform — the
Player, Proof-of-Play, Fleet, billing — is downstream of that answer and is
**out of scope for this sprint** (§35). Scheduling produces a _description_ of the
timeline; nothing here decodes, mixes or emits sound.

## Two layers, one deterministic core

1. **Schedule assignments** (`schedule_assignments`) bind a published program to a
   **target scope** for a local-time window on given weekdays, with an explicit
   priority. The resolver picks exactly one.
2. **Local events** (`local_events`) layer editorial inserts, campaign slots and
   emergencies over the resolved base program as **effective-plan overlays**.

Both feed pure functions. Like the programming compiler, the resolver takes **no
clock, no DB, no random, no locale, no ambient timezone** — all variability is in
the explicit inputs, so the same context always yields the same selection and the
same `effectivePlanHash`.

## Resolution order (specificity → priority → period → id)

`resolveSchedule` filters assignments to those whose **target matches** the unit
and that are **in effect** for the local date/time, then chooses deterministically:

1. **Target specificity**, most specific wins outright:
   `unit (4) > group (3) > sync_group (2) > tenant (1)`.
2. Within the winning level, higher **priority** wins.
3. Then the **narrower period** wins — bounded validity dates, then a narrower
   time window, then fewer weekdays.
4. A final **id** tiebreak keeps it total and stable.

If the two best candidates tie on every key but the id, the resolver still picks
the lowest id **and** emits an `assignment_conflict_detected` warning with a
`assignment_conflict_detected` reason code — it never silently guesses.

The decision is explained by a structured `reasonCode`
(`unit_assignment_selected`, `group_assignment_selected`,
`sync_group_assignment_selected`, `tenant_default_selected`,
`assignment_conflict_detected`, `no_assignment`) plus a human `reason` string.

### Windows and dates

Windows are local wall-clock `HH:mm` half-open intervals `[start, end)`; a
`start >= end` window (empty or cross-midnight) is **rejected at validation**
(400) and, defensively, **skipped with a warning** in the resolver. Weekdays use a
small explicit `0=Sun … 6=Sat` vocabulary; an empty list means _every day_.
Validity is an inclusive local calendar range `YYYY-MM-DD`. All date math is
calendar-only (`Date.UTC(y, m, d)` + `getUTCDay`) so it is DST-agnostic — the
mapping from wall-clock to instant belongs to the compiler's IANA layer, not here.

## Base plan vs effective plan

- The **base plan hash** is the compiler's sequence hash for the resolved program
  version (`playlist_versions.planHash`). It is the **shared identity of a sync
  group** — every unit resolving the same version shares it (see
  [SYNC_GROUPS.md](./SYNC_GROUPS.md)).
- The **effective plan hash** is `hash(basePlanHash + resolution identity +
emergency flag + ordered overlays)`. It equals a bare-base hash when no overlay
  applies and diverges the moment a local event does — per-unit, per-local-date.

See [EFFECTIVE_EXECUTION_PLAN.md](./EFFECTIVE_EXECUTION_PLAN.md) for the full
model and [LOCAL_EVENTS.md](./LOCAL_EVENTS.md) for the overlay mechanics.

## API surface (`/v1/scheduling`)

| Method & path              | Permission                     | Purpose                                     |
| -------------------------- | ------------------------------ | ------------------------------------------- |
| `GET /assignments`         | `scheduling:assignment:read`   | List assignments                            |
| `POST /assignments`        | `scheduling:assignment:manage` | Create an assignment                        |
| `PATCH /assignments/:id`   | `scheduling:assignment:manage` | Update an assignment                        |
| `DELETE /assignments/:id`  | `scheduling:assignment:manage` | Archive an assignment                       |
| `GET /local-events`        | `scheduling:event:read`        | List local events                           |
| `POST /local-events`       | `scheduling:event:manage`      | Create a local event                        |
| `PATCH /local-events/:id`  | `scheduling:event:manage`      | Update a local event                        |
| `DELETE /local-events/:id` | `scheduling:event:manage`      | Archive a local event                       |
| `POST /resolve`            | `scheduling:plan:read`         | Resolve the active program (read-only, 200) |
| `POST /effective-plan`     | `scheduling:plan:read`         | Preview the effective plan (read-only, 200) |

`resolve` and `effective-plan` are POST for their request body but are **pure
reads** — they return `200`, never mutate, and are safe to call repeatedly.
The tenant is always the authenticated context, never a parameter.

## Security & audit

Every table carries `ENABLE`/`FORCE ROW LEVEL SECURITY` with a tenant-isolation
policy; the API connects as the `NOBYPASSRLS` app role, so cross-tenant reads are
impossible even with a forged id (proven by `test/scheduling.spec.ts`). Program
and asset references are validated through RLS-scoped existence checks, so an
assignment can never point at another tenant's program. Every mutation runs in one
tenant transaction with an atomic audit entry
(`scheduling.assignment.created|updated|archived`,
`scheduling.local_event.created|updated|archived`). RBAC is deny-by-default: the
read-only `analyst` role gets `403` on any manage route.

## What is deliberately NOT here (§35)

No Flutter Player, no audio decode/mix/output, no Proof-of-Play, no Fleet device
push or manifest compilation, no billing, no marketplace, no ML. `Player
execution` remains **Not implemented**. Hard-sync _enforcement_ and program-level
emergency _swap_ are modelled and documented but **Prepared**, not operational —
there is no runtime that could carry them out yet.

## Decision records

### ADR-08-01 — A dedicated assignment model, not the RRULE/manifest tables

The pre-existing `schema/scheduling.ts` (device manifests, RRULE strings) is the
future **device-compilation** layer. Overloading it would have forced the resolver
to interpret a cron/rule language, defeating purity. We introduced
`schedule_assignments` with a small explicit _weekday + local-window + validity_
vocabulary so the resolver stays a pure, total function. The manifest tables are
untouched and remain the target for a later Fleet sprint.

### ADR-08-02 — Local events as effective-plan overlays, not program edits

An editorial insert, a campaign slot and an emergency all share one mechanism:
they **overlay** the resolved base plan rather than mutating the published
program. This keeps the base plan hash the stable sync-group identity while the
effective plan absorbs per-unit, per-time variation — and keeps published versions
immutable (§18).

### ADR-08-03 — Emergency as an overlay + flag, program swap Prepared

An emergency is the highest-precedence local event: an `interrupt` overlay plus an
`emergencyActive` flag on the effective plan. A full _program-level swap_ (replace
the entire base program for the duration) needs a runtime to execute it and is
therefore **Prepared**, documented here, not shipped as an operational behaviour.
