# Intelligent Programming Engine (Sprint 07 · §29)

> The four intelligence layers the deterministic compiler grew in Sprint 07,
> on top of the Sprint 06 foundation (`docs/PROGRAMMING_COMPILER.md`).
> Code: `apps/api/src/modules/playlists/compiler/`. Still framework-free (no
> NestJS, DB, HTTP, clock, or random source). Verified by `test/engine.spec.ts`.

## Why this shape

The compiler stays a **pure function**. Every "intelligent" decision is either

1. a deterministic transform of inputs the caller already supplies, or
2. a deterministic reaction to a signal computed **outside** the compiler and
   passed in (`recentPlays`, `affinity`).

That is the whole discipline: the _learning_ happens upstream (play history,
engagement models); the compiler only _applies_ what it is given, the same way
every time. Same inputs ⇒ same `planHash` — the Sprint 06 reproducibility proof
is untouched, and preview still equals what will actually play. The compiler
version is bumped to **2.0.0** because these layers change output when active.

All four layers are **opt-in and default to no-op**: with none of the new inputs
present, v2.0.0 produces the same _kind_ of plan v1.0.0 did (only the seed string
differs because `compilerVersion` participates in it).

## The four layers

### 1. Cross-day fatigue

A track played heavily over recent days should step aside for fresher content
today. The caller passes `CandidateTrack.recentPlays` (plays over its look-back
window); `RotationRules.fatigue.weightPenalty` tunes the reaction:

```
effectiveWeight ÷= 1 + weightPenalty · recentPlays
```

`weightPenalty = 0` (or `recentPlays = 0`) ⇒ no effect. Larger values push
variety across days more aggressively. It only lowers the _odds_ of a fatigued
track — it never hard-blocks, so a thin catalog still fills.

### 2. Advanced rotation categories

Beyond the track and artist gaps, two tracks that **share a category** (genre,
energy tag, …) are kept apart by a category gap. `CandidateTrack.categories`
carries the tags; `RotationRules.minCategoryGapMinutes` is the base gap, with
per-category overrides in `categoryGaps` (e.g. jingles every 60 min, songs every
5). The category gap is **relaxable** (`relaxable.categoryGap`) and, when relaxed
to fill a thin period, records `category_gap` and emits `category_gap_relaxed`.

Relaxation order is now: strict → artist → **category** → track → fallback, so
repeating the exact same track stays the last resort.

### 3. Paired-track avoidance

Some assets must not play close together (two mixes of one song, an explicit +
clean pair, competing sponsors). `RotationRules.avoidPairs` lists
`{ a, b, minGapMinutes }`; either asset blocks the other within the gap. It is a
**hard** constraint at every relaxation level — only the safety fallback (which
ignores all rules by definition) can bypass it. `stats.engine.avoidPairBlocks`
counts how many times a pair excluded an otherwise-eligible candidate at the
strict level, so operators can see the rule doing work.

### 4. Learned personalization

An upstream model scores each candidate's fit for the target audience/daypart as
`CandidateTrack.affinity ∈ [0, 1]` (0.5 = neutral).
`RotationRules.personalization.strength ∈ [0, 1]` sets how much it matters:

```
effectiveWeight ·= 1 + strength · (2 · affinity − 1)
```

`affinity 0 → (1 − strength)`, `0.5 → 1`, `1 → (1 + strength)`. A missing
affinity is neutral; `strength = 0` disables the layer. The compiler never
trains anything — it applies a learned score deterministically.

## Effective weight

The two weight-modulating layers compose into one deterministic accessor used by
the seeded weighted pick (personalization and fatigue; source weight is the
base):

```
effectiveWeight = max(sourceWeight, 0)
                · personalization(affinity, strength)   // ×
                ÷ fatigue(recentPlays, weightPenalty)   // ÷
```

If every effective weight collapses to 0 (e.g. `strength = 1`, all `affinity 0`),
the pick falls back to a uniform choice — the loop always makes progress.

## Explainability

Each item's `reason` gains bits for the layers that shaped it —
`audience-preferred` / `audience-de-emphasized`, `rotation-balanced across days`,
and the relaxation notes (`category window relaxed`, …). `stats.engine` reports
which layers were actually active:

```jsonc
"engine": {
  "fatigueApplied": false,          // penalty > 0 AND some recentPlays > 0
  "personalizationApplied": false,  // strength > 0 AND some non-neutral affinity
  "categoriesApplied": false,       // gap configured AND some categories present
  "avoidPairBlocks": 0              // strict-level exclusions caused by a pair
}
```

## Persistence & configuration

The tenant `rotation_policies` row (migration `0007_programming_engine_policy`,
additive, nullable) gained `min_category_gap_minutes`, `fatigue_weight_penalty`
and `personalization_strength`. `null`/`0` ⇒ layer off. The service maps the
policy into `RotationRules` and derives `categories` from the Library's
`tracks.genres`; `recentPlays`/`affinity` arrive from a future signals pipeline
and are simply `undefined` until then — the engine already honours them.

Contracts (`upsertRotationPolicySchema`, `rotationPolicySchema`,
`executionPlanSchema.stats.engine`), the SDK types and the Dashboard rotation
rules editor all carry the new fields; the editor treats `0` as "off".

## Tests (`test/engine.spec.ts`, 12)

Fatigue de-weighting + off-by-default, category gap + per-category override +
relaxation-with-warning, paired-track separation + block counting,
personalization preference + neutral/off behaviour, determinism preserved across
all four layers combined, and the all-inactive baseline. The Sprint 06
`compiler.spec.ts` (16) still passes unchanged, and `programming.spec.ts` gains
an API round-trip of the engine knobs + engine-aware, deterministic preview.
