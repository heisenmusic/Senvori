# Senvori Player — Architecture (Sprint 09)

> Foundation of the Flutter Player. This document is the map; the sibling
> `PLAYER_*.md` files go deep per subsystem. **Honesty first**: this sprint ships
> a real, tested _runtime_ wired to in-memory/fake infrastructure. It does not
> claim production distribution, real audio output, certified Proof of Play, or
> Hard Sync. See the completeness matrix at the bottom.

## Two layers, one direction of truth

```
PLAYER RUNTIME        state, plans, cache, downloads, playback, resilience
      ▲  (the UI observes; it is never the source of truth)
PLAYER EXPERIENCE     renders runtime state — beautifully, clearly, accessibly
```

The **runtime** is pure Dart with injected ports (clock, filesystem, network,
connectivity, audio engine). It is fully unit-testable headless. The
**experience** layer renders an immutable view-state and reports intents via
callbacks, so screens are deterministic under widget/golden tests.

Data flow:

```
Configuration → Device identity → Effective plan → Validation →
Asset availability → Execution queue → Playback runtime → Operational events → Reactive UI
```

## Directory layout (`apps/player/`)

```
lib/
├── app/            composition root, lifecycle machine, runtime, view mapper
├── bootstrap/      phased boot with real progress
├── core/           config, errors, logging, persistence, result, time
├── features/
│   ├── activation/       pairing flow (gateway port + mock)
│   ├── asset_cache/      cached asset model, download manager, disk policy, io
│   ├── connectivity/     connectivity spectrum + monitor
│   ├── demo/             labelled demo fixtures
│   ├── device_identity/  persistent identity + repository
│   ├── diagnostics/      protected, sanitized diagnostics
│   ├── now_playing/      Now Playing, boot, view-state, status descriptors
│   ├── plan_runtime/     plan domain, validator, wire mapper, last-known-good store
│   ├── playback/         engine port, fake engine, orchestrator
│   ├── queue/            execution queue
│   └── telemetry/        outbox (Proof-of-Play foundation)
├── design_system/  tokens, theme, ambient artwork, components
├── l10n/           pt-BR, en-US, es-ES (ARB)
└── main.dart       demo-mode entrypoint
test/               runtime, integration, soak, widget, golden, l10n parity
```

## Lifecycle state machine

Explicit states with an allow-list of transitions (`app/player_lifecycle.dart`).
Invalid transitions are logged and rejected, never silently applied.

```
booting → awaitingActivation → loadingConfiguration → synchronizing → ready
        → playing ⇄ pausedByPolicy ⇄ offlineOperational ⇄ degraded
        → emergency (absolute priority) → back to operational
        → fatalError → booting (restart only)
```

Every state carries a reason, a wall timestamp and a monotonic marker.

## Key principles enforced in code

- **No `DateTime.now()` in logic** — `Clock`/`MonotonicClock` are injected.
- **Last-known-good is sacred** — an invalid or not-yet-ready plan never replaces
  the active one.
- **Offline-first** — boot restores the persisted plan and plays it before any
  network call; a fresh process over persisted state resumes playback.
- **Ports over singletons** — filesystem, transport, checksum, connectivity and
  audio are interfaces; production and test wire different adapters.
- **Colour is never the only signal** — every operational state pairs icon +
  text + semantics.

## Completeness matrix (§64)

| Capability              | Domain | Persistence | Runtime | UI  | Tests | Status   |
| ----------------------- | ------ | ----------- | ------- | --- | ----- | -------- |
| Bootstrap               | ✅     | ✅          | ✅      | ✅  | ✅    | Complete |
| Device identity         | ✅     | ✅          | ✅      | ✅  | ✅    | Complete |
| Activation              | ✅     | ✅          | ⚠️ mock | ✅  | ✅    | Partial  |
| Plan validation         | ✅     | ✅          | ✅      | —   | ✅    | Complete |
| Last-known-good plan    | ✅     | ✅          | ✅      | ✅  | ✅    | Complete |
| Offline restart         | ✅     | ✅          | ✅      | ✅  | ✅    | Complete |
| Asset cache             | ✅     | ✅          | ✅      | ⚠️  | ✅    | Partial  |
| Download queue          | ✅     | ✅          | ✅      | ⚠️  | ✅    | Partial  |
| Disk management         | ✅     | —           | ✅      | —   | ✅    | Partial  |
| Playback engine         | ✅     | —           | ⚠️ fake | ✅  | ✅    | Partial  |
| Queue orchestration     | ✅     | —           | ✅      | ✅  | ✅    | Complete |
| Inserts                 | ✅     | ✅          | ✅      | —   | ✅    | Partial  |
| Overlays                | ✅     | ✅          | ⚠️      | —   | ⚠️    | Prepared |
| Emergency interrupt     | ✅     | ✅          | ✅      | ✅  | ✅    | Complete |
| Now Playing             | —      | —           | ✅      | ✅  | ✅    | Complete |
| Ambient Mode            | —      | —           | ✅      | ✅  | ✅    | Complete |
| Diagnostics             | ✅     | —           | ✅      | ✅  | ✅    | Complete |
| Operational telemetry   | ✅     | ✅          | ⚠️ mock | —   | ✅    | Partial  |
| Certified Proof of Play | ⚠️     | ⚠️          | ❌      | ❌  | ❌    | Prepared |
| Soft Sync               | ✅     | ✅          | ⚠️      | ⚠️  | ⚠️    | Prepared |
| Hard Sync               | ⚠️     | ❌          | ❌      | ❌  | ❌    | Prepared |

Status legend: **Complete** (runtime real & tested) · **Partial** (real runtime,
stubbed infra) · **Prepared** (contracts/abstractions only) · **Not implemented**.

Real audio output (`Partial` → engine is a fake), a production activation
backend, download transport against real signed URLs, and disk free-space
queries are the follow-ups that turn Partials into Complete. Those require infra
outside this sprint's scope.
