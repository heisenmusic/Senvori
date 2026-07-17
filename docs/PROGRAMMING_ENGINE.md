# Intelligent Programming Engine (Sprint 07 · §29)

> The deterministic capabilities the compiler grew in Sprint 07, on top of the
> Sprint 06 foundation (`docs/PROGRAMMING_COMPILER.md`). Code:
> `apps/api/src/modules/playlists/compiler/`. Still framework-free (no NestJS,
> DB, HTTP, clock, or random source). Verified by `test/engine.spec.ts` and
> `test/engine-simulation.spec.ts`.

## Honest scope — read this first

Sprint 07 delivered the **engine** for four capabilities (compiler **2.0.0**);
**Sprint 07B** (Historical Programming Runtime) supplied the missing signals and
product surfaces. The compiler is still a pure function that _applies_ signals; it
does **not** learn and does **not** read the database — see
`docs/PROGRAMMING_HISTORY.md` for how history is derived deterministically.

Status legend:

- **Complete** — engine + persistence + API + SDK + Dashboard + an E2E test.
- **Partial** — wired through some layers, with a material gap.
- **Prepared** — the engine (and sometimes a config knob) exists, but a required
  input or surface is missing.
- **Not implemented**.

### Capability matrix (after Sprint 07B)

| Capability                   | Engine | Persistence | Service | API | SDK | Dashboard | E2E | Status       |
| ---------------------------- | ------ | ----------- | ------- | --- | --- | --------- | --- | ------------ |
| Advanced rotation categories | ✅     | ✅          | ✅      | ✅  | ✅  | ✅        | ✅  | **Complete** |
| Cross-day fatigue            | ✅     | ✅          | ✅¹     | ✅  | ✅  | ✅        | ✅  | **Complete** |
| Cross-day seam (`carryOver`) | ✅     | ✅          | ✅¹     | ✅  | ✅  | ✅        | ✅  | **Complete** |
| Paired-track avoidance       | ✅     | ✅          | ✅      | ✅  | ✅  | ✅        | ✅  | **Complete** |
| Affinity-aware weighting     | ✅     | ⚠️ knob     | ⚠️      | ⚠️  | ⚠️  | ⚠️        | ❌  | **Prepared** |

¹ Fatigue and the seam are fed by **planned history** — a deterministic projection
of prior local dates (`buildPlannedHistory`), not Proof-of-Play. Real
`verified_playback_history` is a future provider with the same shape. See
`docs/PROGRAMMING_HISTORY.md`.

² **Affinity remains Prepared.** The `affinityStrength` knob is persisted and
editable end-to-end, but the per-track `affinity` **score has no source** — nothing
computes or stores it. The compiler applies a supplied score deterministically; it
is _not_ learning and there is _no_ personalization model. Named **affinity-aware
deterministic weighting**, never "learned personalization". Deferred to a future
sprint with an explicit affinity provider.

## 1. Advanced rotation categories — Complete

Two tracks that **share a category** (from `tracks.genres`) are kept apart by a
category gap. `CandidateTrack.categories` carries the tags;
`RotationRules.minCategoryGapMinutes` is the base gap, with per-category
overrides in `categoryGaps`. Relaxable (`relaxable.categoryGap`); when relaxed it
records `category_gap` and emits `category_gap_relaxed`. Relaxation order:
strict → artist → **category** → track → fallback.

End-to-end path (all present): `tracks.genres` (DB) → migration
`0007_programming_engine_policy` (`min_category_gap_minutes`) → repository
(`loadCandidates` selects `genres`) → service (`toCandidates` maps genres →
categories; `toRules` reads the policy) → contracts → SDK → Dashboard editor →
compiler. Proven by a real-Postgres E2E test in `programming.spec.ts` (mixed
catalog, `categoriesApplied` true, per-genre gap holds without relaxation).

## 2. Cross-day fatigue — Prepared

`effectiveWeight ÷= 1 + weightPenalty · recentPlays`. `RotationRules.fatigue`
tunes it; `CandidateTrack.recentPlays` is the signal. The engine and the
`fatigueWeightPenalty` policy knob are complete and reproducible. **Missing:** a
pipeline that counts recent plays (per asset, per look-back window, DST-correct)
from `playback_events` and feeds `recentPlays` into `toCandidates`. Until then
`recentPlays` is always `undefined`, so `fatigueApplied` is always `false` in
production. The behaviour is proven only in simulation (see below).

## 3. Affinity-aware weighting — Prepared

`effectiveWeight ·= 1 + strength · (2 · affinity − 1)`, `affinity ∈ [0, 1]`
(0.5 = neutral). `RotationRules.affinityWeighting` tunes it. The engine and the
`affinityStrength` policy knob are complete. **Missing:** whatever computes and
stores an affinity score per track/audience/daypart. There is **no learning**
anywhere in this sprint; the compiler applies a given score deterministically.
Until a score source exists, `affinity` is `undefined`, so `affinityApplied` is
always `false` in production.

## 4. Paired-track avoidance — Prepared (engine-only)

`RotationRules.avoidPairs` (`{ a, b, minGapMinutes }`) keep configured asset
pairs apart — a **hard** constraint at every relaxation level (only the safety
fallback bypasses it), counted in `stats.engine.avoidPairBlocks`. This exists
**only in the compiler**: there is no column, contract, endpoint, SDK method,
Dashboard surface, or RBAC/RLS/audit path, and `toRules` never populates it. It
is an engine capability awaiting a product surface (07B).

## 5. Cross-day seam (`carryOver`) — Prepared (engine primitive)

`CompilationContext.carryOver` seeds the previous window's tail into the
placement history at negative offsets, so track/artist/category/pair gaps span
the day boundary (e.g. yesterday's last track does not open today when the track
gap forbids it). It is a pure engine input; the service does not yet supply it
(the previous day's plan tail would come from published versions / play history
in 07B). Used by the simulation to prove seam continuity.

## Effective weight

The two weight-modulating layers compose into one deterministic accessor used by
the seeded weighted pick (affinity weighting × fatigue; source weight is the
base):

```
effectiveWeight = max(sourceWeight, 0)
                · affinity(affinity, strength)          // ×
                ÷ fatigue(recentPlays, weightPenalty)   // ÷
```

If every effective weight collapses to 0, the pick falls back to a uniform
choice — the loop always makes progress.

## Explainability & stats

Each item's `reason` gains bits for the layers that shaped it —
`audience-preferred` / `audience-de-emphasized`, `rotation-balanced across days`,
and the relaxation notes. `stats.engine` reports which layers were **actually
active** (config on _and_ the signal present), so an operator can see that, today,
fatigue/affinity are inactive for lack of a signal:

```jsonc
"engine": {
  "fatigueApplied": false,   // penalty > 0 AND some recentPlays > 0
  "affinityApplied": false,  // strength > 0 AND some non-neutral affinity
  "categoriesApplied": true, // gap configured AND some categories present
  "avoidPairBlocks": 0       // strict-level exclusions caused by a pair
}
```

## Persistence & configuration

Migration `0007_programming_engine_policy` (additive, nullable) added
`min_category_gap_minutes`, `fatigue_weight_penalty` and `affinity_strength` to
`rotation_policies` (`null`/`0` ⇒ off). Contracts
(`upsertRotationPolicySchema`, `rotationPolicySchema`,
`executionPlanSchema.stats.engine`), the SDK types and the Dashboard
rotation-rules editor (pt-BR/en-US/es-ES) all carry the three knobs. `avoidPairs`
and `carryOver` have **no** persistence or surface yet.

## Tests

- **`test/engine.spec.ts`** (12) — each layer in isolation + off-by-default +
  combined determinism.
- **`test/engine-simulation.spec.ts`** (10) — a **simulation** of the 07B signal
  pipeline over seven consecutive dates with a fatigue/seam feedback loop:
  distinct daily sequences, per-date reproducibility, first-track variation, no
  cross-day seam repeat, high-`recentPlays` suppression, avoid-pair and category
  separation, catalog-only fill, and safe termination when rules are impossible.
  Emits weekly metrics (cross-day overlap %, track/artist frequency, first-track
  repetition, pair repetition, relaxed-rule days, fallback days). This proves the
  _engine_ given the signals — not that the signals are wired.
- **`programming.spec.ts`** — real-Postgres round-trip of the three policy knobs
  - the categories E2E.
- Sprint 06 **`compiler.spec.ts`** (16) unchanged.

## Deferred to Sprint 07B (proposed)

1. **Play-history read model** feeding `recentPlays` from `playback_events` (a
   DST-correct per-asset look-back), wired into preview and publish → makes
   **cross-day fatigue** Complete.
2. **Cross-day seam** in the service: supply `carryOver` from the previous day's
   plan tail.
3. **Affinity source**: define, compute and store an affinity score (its data
   basis, update cadence, audit and explainability) → makes **affinity-aware
   weighting** Complete. Still deterministic application; scope the model
   explicitly.
4. **Paired-track avoidance product surface**: `avoid_pairs` table + contracts +
   endpoints + SDK + Dashboard + RLS/RBAC/audit → makes it Complete.
