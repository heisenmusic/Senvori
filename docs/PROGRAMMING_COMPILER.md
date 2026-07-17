# Programming Compiler (Sprint 06 · §28)

> The pure, deterministic engine that turns configuration into a plan.
> Code: `apps/api/src/modules/playlists/compiler/`. Framework-free (no NestJS, no
> DB, no HTTP, no clock, no random source). Verified by `test/compiler.spec.ts`.
>
> **Sprint 07** grew four deterministic capabilities on top of this foundation
> (advanced rotation categories, cross-day fatigue, affinity-aware weighting,
> paired-track avoidance) and bumped the compiler to **2.0.0**. Only advanced
> categories is wired end-to-end; the others are engine-level and **Prepared**.
> This document describes the v1 core; see `docs/PROGRAMMING_ENGINE.md` for the
> honest capability matrix. All layers are opt-in and default to no-op, so
> everything below still holds.

## Inputs

`compile(context, candidates, rules, fallback) → ExecutionPlan`

- **CompilationContext:** `tenantId`, `programVersion`, `syncGroup`, `unitId`,
  `timezone` (IANA), `localDate` (`YYYY-MM-DD`), `windowStartLocal`/`windowEndLocal`
  (`HH:mm`, end may be `24:00`), `compilerVersion`.
- **CandidateTrack[]:** already-loaded, pre-filtered tracks — `assetId`, `title`,
  `durationMs` (>0), `artist` (nullable), `source`, `weight` (>0). The algorithm
  never touches the DB; the caller loads candidates.
- **RotationRules:** `minTrackGapMinutes`, `minArtistGapMinutes`, `maxPlaysPerTrack?`,
  `relaxable: { trackGap, artistGap }`.
- **FallbackPolicy:** `safety` (safety-content tracks), `allowSilence`.

## Determinism (ADR-06-02)

- **Seed:** `sha256(tenantId + programVersion + syncGroup + localDate + compilerVersion)`
  (`seed.ts`). PRNG = mulberry32 seeded from the hex. Same tuple ⇒ same sequence.
- **No ambient nondeterminism:** never calls `Date.now()` or `Math.random()`.
- **Plan hash:** canonical (sorted-key) stable stringify → `sha256` of the plan body
  (`hashPlan`). Same inputs ⇒ same `planHash`. This is the reproducibility proof used
  by preview and by the immutable published version.

## Timezone (§9.7)

`time.ts` resolves a local wall-clock (`localDate` + `HH:mm` at an IANA zone) to the
correct UTC instant using the platform `Intl` timezone database — no static offsets.
A two-pass guess/refine handles DST boundaries. Invalid timezone → structured
`CompileError("invalid_timezone")`. Tested for `America/Sao_Paulo` (UTC−3 year-round),
`America/New_York` (EDT/EST), `Europe/Madrid` (CEST/CET), and the NY spring-forward
transition.

## Algorithm

Greedy fill of `[windowStart, windowEnd)` with a hard iteration cap (`MAX_ITERATIONS
= 100_000`, guarantees termination — §17):

1. At each step, from candidates that pass the rotation rules **now**, pick one by
   deterministic weighted choice; place it; advance the offset by its duration.
2. **Progressive relaxation (ADR-06-07):** strict → relax artist gap (if relaxable) →
   relax track gap (if relaxable). Each relaxation is recorded.
3. **Fallback:** if nothing places even relaxed, use safety content (ignores gaps —
   last resort), counted.
4. **Silence / stop:** if no candidate and no fallback: with `allowSilence`, fill the
   remaining window with a single silence marker; otherwise stop.
5. Loop until the window is filled or no progress can be made (never infinite).

**Rotation checks:** a track is blocked if the same `assetId` played within
`minTrackGapMinutes`, or the same `artist` within `minArtistGapMinutes`, or its
`maxPlaysPerTrack` is reached. History is scanned newest-first with an early exit once
older than both gaps.

## Output (ExecutionPlan)

`compilerVersion`, `seed`, `timezone`, `localDate`, `windowStartUtc`/`windowEndUtc`
(ISO), `totalDurationMs`, ordered `items` (each with `position`, `assetId` (null for
silence), `title`, `artist`, `startOffsetMs`, `durationMs`, `source`, and a human
`reason` — explainability §17), `warnings` (typed codes), `planHash`, and `stats`
(`candidateCount`, `itemCount`, `relaxedRules`, `fallbackCount`).

**Warning codes:** `empty_program`, `insufficient_catalog`, `track_gap_relaxed`,
`artist_gap_relaxed`, `fallback_used`, `window_not_filled`. The UI maps codes to
product copy (§21) — the compiler never emits UI strings.

## Performance (§24)

- Complexity ≈ `O(items × min(history, gapWindow))`; history scan short-circuits.
- Bounded by `MAX_ITERATIONS`; each placed item advances the offset (durations > 0),
  so the loop is finite in the window length.
- No recursion, no open loops, no I/O. A 2-hour window over a few-dozen-track catalog
  compiles in well under a millisecond in the unit tests.

## Tests (`test/compiler.spec.ts`, 16)

Determinism (identical hash), daily/sync-group variation, track-gap and artist-gap
adherence, source weighting, insufficient-catalog relaxation + warnings, safety
fallback, empty-program silence, termination when nothing fits, window/duration
bounds, and timezone/DST resolution.
