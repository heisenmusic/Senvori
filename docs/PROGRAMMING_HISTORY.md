# Historical Programming Runtime (Sprint 07B · §29B)

> How the programming engine gains **operational memory** without ceasing to be
> deterministic. Code: `apps/api/src/modules/playlists/history/`, wired through
> `PlaylistsService`. The compiler stays a pure function; history is an _input_.
> Verified by `test/programming-history.spec.ts` and `test/history-simulation.spec.ts`.

## The problem

The Sprint 07 engine could de-weight fatigued tracks and honour a cross-day seam,
but nothing supplied those signals — the radio effectively restarted from zero
every day. Sprint 07B builds the signal source so continuity and fatigue become
real, and turns paired-track avoidance into a configurable product.

## Planned history vs verified playback

There is **no Player and no Proof-of-Play** yet, so `playback_events` has no
producer and must not be treated as a truth source. Instead we use
**`planned_history`**: a deterministic projection of what the program _would have
played_ on the prior local dates, obtained by **re-compiling** those dates.

The two sources are named explicitly and never mixed:

- `planned_history` — reproducible projection from published/draft content. **Not**
  a claim that a track was reproduced. Used today.
- `verified_playback_history` — from real Proof-of-Play. A future provider with the
  same shape; the compiler will not change when it arrives.

## Determinism

The flow is strictly one-directional:

```
DB + services  →  Historical Programming Context  →  Compiler Input  →  Execution Plan
```

The compiler never touches DB/clock/HTTP/Redis/random. History is derived by
`buildPlannedHistory` (pure): for a target local date it re-compiles the program's
content for each prior date with **fatigue OFF** (so there is no recursion) and
aggregates. For the same full inputs — tenant + program version + sync group +
local date + config + history — the plan and `planHash` are identical.

## What the context carries

`HistoricalProgrammingContext` (§8):

- `source` — `planned_history` here.
- `lookbackDays` — local days considered (policy `history_lookback_days`, default 7).
- `recentTrackPlays` / `recentArtistPlays` — counts across the look-back.
- `previousWindowTail` — the trailing items of the immediately-previous local day,
  each with `minutesBeforeStart` measured in **wall-clock** minutes across the seam.
- `historyFromLocalDate` / `historyToLocalDate`.

### Cross-day seam

`previousWindowTail` is seeded into the compiler's placement history at negative
offsets (`carryOver`), so track/artist/category/pair gaps span midnight. The seam
gap is `(1440 − endMinutes) + startMinutes`: **0** for a continuous 24 h window
(yesterday's last track is adjacent to today and thus blocked by the track gap),
and large for a partial window (the days are not contiguous, so the seam correctly
stops mattering). Toggle: policy `cross_day_continuity` (default on).

### Cross-day fatigue

`recentPlays` now comes from `recentTrackPlays`; with `fatigue_weight_penalty` set,
heavily-played tracks lose effective weight (`÷ 1 + penalty·recentPlays`). This is
the Sprint 07 layer, now fed by real history instead of a test fixture.

## Local dates & DST (§18)

The runtime is **local calendar-date based**: "the previous day" is a civil-date
shift (`shiftLocalDate`), never a `−24 h` subtraction from an instant. The
timezone offset only matters when a date + time is resolved to a UTC instant —
which the compiler already does per date with the platform IANA database — so a
23 h or 25 h DST day, a leap day, and month/year boundaries all resolve
correctly. A change of offset never changes the identity of the civil date.

## Paired-track avoidance (§11)

Now a full product vertical, not just an engine input:

- **`rotation_pairs`** (migration `0008`, tenant-wide): order-normalised
  `asset_a`/`asset_b` (a unique index rejects duplicates _and_ inversions), a
  `min_gap_minutes`, an `active` flag, audit columns. **RLS + FORCE**, tenant
  isolation, `a <> b` check.
- **API**: `GET/POST /v1/programs/rotation-pairs`, `PATCH/DELETE .../:pairId`,
  guarded by two permissions — `playlists:rotation_pair:read` and
  `playlists:rotation_pair:manage` (create/update/delete). A single `manage`
  permission (rather than separate `create`/`update`/`delete`) is a deliberate
  least-surface choice: every role that may create a pair may also edit and remove
  it, so splitting them would add three grants that always move together. Owner,
  admin and curator receive both via `playlists:*`. Transactional audit on every
  mutation; `409` on duplicates.
- **SDK + Dashboard**: typed client methods and a "Recurring pairs" editor.
- Active pairs feed the compiler for **preview and publish** (hard constraint,
  counted in `stats.engine.avoidPairBlocks`).

## Preview & publish (§13)

Preview assembles the historical context and compiles the day deterministically.
Publish records **which** history runtime was in effect (`source`, `lookbackDays`,
`crossDayContinuity`) plus the active pairs in the immutable version `context` and
`planHash` fingerprint. Per-date plans (with history) are produced at
preview/runtime — consistent with the Sprint 06 model where the compiled plan is
not stored at publish.

## Configuration & defaults (§14)

`rotation_policies` gains `history_lookback_days` and `cross_day_continuity`
(additive, nullable → service defaults 7 / on). Existing tenants are unchanged
until they opt in. Fatigue and affinity default off; affinity remains **Prepared**
(no score source — deferred, no learning claim).

## Tests

- **`programming-history.spec.ts`** (11) — local calendar-date arithmetic
  (month/year/leap/DST-boundary shifts), seam gap, deterministic aggregation,
  zero look-back, partial-window seam, DST-day determinism, single-track and
  single-artist thin catalogs.
- **`history-simulation.spec.ts`** (9) — a 14-day simulation over the real
  `buildPlannedHistory` path: per-date determinism, controlled daily variation,
  strict seam (last ≠ first), first-track variety, avoid-pair + category
  separation, no fallback, fatigue frequency spread, safe termination, and the
  continuity toggle (off ⇒ seam not enforced, still deterministic). Emits
  fortnight metrics (see below).
- **`programming.spec.ts`** — real-Postgres pairs CRUD, transactional audit, `409`
  duplicates, RBAC denial, tenant isolation (list plus no cross-tenant
  create/update/delete), and preview separation.

## Metrics interpretation (§17)

The 14-day simulation prints fortnight metrics; read them with the setup in mind
(a full-day 00:00–24:00 window over a rich catalog):

- **`avgCrossDayOverlapPct` ~99.9%** — this is a **Jaccard of the day's asset
  _sets_**. With a 24 h window and a catalog that comfortably fits, nearly every
  track plays every day, so the _set_ overlap is ~100% **by construction** — it is
  **not** evidence of good variety. The real variety lives in the **order**
  (distinct `planHash` per day, `firstTrackRepetitions` low, `lastToFirstCollisions`
  = 0), which the other metrics measure. Narrow the window or the catalog and this
  number drops. It is kept as a sanity bound (0 < x < 100), not a quality target.
- **`trackFreq` / `artistFreq` (min–max)** — spread of plays; a wide-but-bounded
  range under fatigue shows heavy tracks are de-emphasised without starvation.
- **`firstTrackRepetitions`** — how often a day opens with a repeated first track.
- **`lastToFirstCollisions`** — days that open with the previous day's closing
  track; **0** proves the seam. **`relaxedDays` / `fallbackDays`** — rule health.

Metrics use a fixed seed (deterministic PRNG) and the real `buildPlannedHistory`
path, so they are reproducible.

## Limitations (honest)

- **No real Proof-of-Play**: history is _planned_, not _verified_. `playback_events`
  has no producer and is deliberately not read.
- **No Affinity Provider**: affinity weighting stays **Prepared** (no score source,
  no learning). It is **not** Complete.
- **Not exact time-travel.** Planned history reconstructs prior days from the
  **current** program content, rotation rules and pairs. Exact reproduction of a
  past day will require **temporal versioning of assignments, rotation rules and
  program versions** (validity windows) — a deliberate future refinement, not a
  claim of this sprint.
- **Player and Fleet** remain future dependencies; `verified_playback_history`
  arrives with them.
