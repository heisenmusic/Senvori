# Effective Execution Plan (Sprint 08 · §16–§18)

> The bridge between a **shared base program** and the **per-unit, per-local-date
> reality** of what a unit should play. Code: `assembleEffectivePlan` in
> `apps/api/src/modules/scheduling/resolver/resolver.ts`. Pure and deterministic.

## Base plan vs effective plan

- **Base plan** — the compiler's published sequence for a program version. Its
  hash (`playlist_versions.planHash`) is immutable and **shared across a sync
  group** (see [SYNC_GROUPS.md](./SYNC_GROUPS.md)).
- **Effective plan** — the base plan _plus the ordered overlays in effect for one
  unit at one local date/time_. Its hash is per-unit and per-moment.

Keeping the two separate lets a sync group keep one stable identity while every
unit still gets a truthful, local answer.

## Composition

`assembleEffectivePlan` takes the resolution, the base plan hash, the ordered
overlays and the emergency flag, and produces:

```
effectivePlanHash = hash({
  basePlanHash,
  selectedAssignmentId,
  selectedProgramVersionId,
  emergencyActive,
  overlays,            // sorted: startOffsetMs, then kind, then sourceReference
})
```

Properties that follow directly:

- **No overlays ⇒ effective reflects the base alone.** The base plan hash remains
  the sync-group shared identity; the effective hash is a stable function of it.
- **Any overlay ⇒ the effective hash diverges** from the bare-base value, and does
  so identically for identical inputs.
- **Order-independence.** Overlays are sorted before hashing, so the effective hash
  does not depend on the order events were loaded from the database.
- **Emergency participates in the hash**, so an emergency window yields a distinct
  effective plan even if its overlay geometry matched a normal one.

## Determinism contract

The whole path — `resolveSchedule` → `selectLocalEventOverlays` →
`assembleEffectivePlan` — is pure: no clock, no DB, no random, no locale, no ambient
timezone. Given the same unit, local date/time, assignments and events, it returns a
**byte-identical** effective plan. `test/scheduling-timeline.spec.ts` asserts this
across a full simulated day and under shuffled inputs; `test/scheduling.spec.ts`
asserts it end-to-end over real Postgres (two calls, identical `effectivePlanHash`).

## Warnings are data, not exceptions

Resolution and overlay selection never throw on bad-but-recoverable input. An
empty/cross-midnight window, an ambiguous assignment tie, or a masked overlay each
append a structured warning (`invalid_assignment_window`,
`assignment_conflict_detected`, `invalid_event_window`, `local_event_masked`) and
the plan is still produced deterministically. Callers — and the future Player — get
both the decision and the reasons it might warrant review.

## What consumes this (later sprints)

The effective plan is a **description**. Nothing in Sprint 08 renders it: there is no
Player, no audio, no Proof-of-Play (§35). A future Player sprint will consume the
effective plan and its overlays to actually schedule playback; the hash gives that
runtime a stable identity to cache, diff and verify against.
