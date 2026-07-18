---
---

Flutter Player Foundation (Sprint 09): the first vertical of the Senvori Player,
under `apps/player/`. A pure-Dart **runtime** (source of truth) split from a
premium Flutter **experience** layer, wired through injectable ports so the whole
runtime is headless-testable.

Real and tested this sprint: explicit lifecycle state machine (allow-listed
transitions), phased bootstrap with real progress, persistent device identity,
plan validation + wire mapper + last-known-good store, **offline restart**
(persisted plan reloads and plays), asset cache with atomic downloads + checksum
validation + deterministic disk eviction, playback engine abstraction with a
deterministic orchestrator (bounded retry, skip, **emergency interrupt/restore**),
connectivity spectrum, telemetry outbox (dedup/persist/prune), and a premium Now
Playing with Ambient/Operational/Diagnostics modes, deterministic ambient
artwork, motion + reduce-motion, responsive layouts, full pt-BR/en-US/es-ES i18n
and accessibility. 70 tests (unit, widget, golden, integration, 24h simulated
soak, l10n parity). New CI `player` job (format/analyze/test/build apk).

Honestly **Prepared / not implemented**: real audio output (engine is a
deterministic fake), production activation backend, real download transport +
disk free-space queries, secure keystore, Hard Sync, and **certified Proof of
Play** (telemetry is prepared operational telemetry, never labelled "proven").
This changeset intentionally lists no `@senvori/*` packages — the Player is a
standalone Flutter app outside the pnpm/changesets version graph.
