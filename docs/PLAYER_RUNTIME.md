# Player Runtime

The runtime is the source of truth. It is pure Dart with injected ports and is
constructed headless in tests via `RuntimeFactory.demo(...)`.

## Composition root — `PlayerRuntime`

Holds every subsystem and exposes streams the UI observes. `boot()` runs the
phased bootstrap; `applyPlan(...)` runs the full receive→validate→ensure-assets
→activate→load pipeline.

## Bootstrap phases (`bootstrap/boot_phase.dart`)

Real, ordered progress — never a white screen or an infinite fake spinner:

```
initializingStorage → loadingIdentity → loadingConfiguration → restoringPlan
→ verifyingAssets → initializingAudio → initializingConnectivity → ready
```

If the device is not yet activated, boot stops at `awaitingActivation` and the UI
drives pairing. If a last-known-good plan exists, playback starts from it before
connectivity is even evaluated (offline-first).

## Clocks (`core/time/clock.dart`)

- `Clock` — wall/calendar time (schedule windows, timestamps). May step.
- `MonotonicClock` — elapsed time (backoff, uptime, soak). Never runs backwards.

The runtime never calls `DateTime.now()`. `FakeClock`/`FakeMonotonicClock` make
every time-dependent path deterministic. `FakeClock` even allows a backwards step
to model an NTP correction the runtime must tolerate.

## Lifecycle machine (`app/player_lifecycle.dart`)

An allow-list table (`_allowed`) defines legal transitions. `transition()`
returns `false` and logs `lifecycle_transition_rejected` for an illegal edge —
the Player degrades predictably instead of crashing on unexpected event ordering.

## Errors (`core/errors/player_error.dart`)

A closed taxonomy (`ErrorCategory`) with stable codes, severity, retryability, a
developer message and an l10n **key** for the operator message. Stack traces
never reach the screen; `PlayerErrors.*` are the canonical constructors.

## Result type (`core/result/result.dart`)

Expected failures are `Result<T>` values (`Ok`/`Err`), not thrown exceptions.
Exceptions are reserved for programmer errors.

## What is real vs. stubbed

| Piece                | This sprint                                      |
| -------------------- | ------------------------------------------------ |
| Lifecycle            | Real, exhaustively tested                        |
| Plan validation      | Real, pure, tested                               |
| Persistence          | Real (`FileKeyValueStore`) + in-memory for tests |
| Asset cache/download | Real logic; transport is null/fake in demo       |
| Playback engine      | `FakePlaybackEngine` (deterministic, no audio)   |
| Connectivity         | Real monitor; probe is scripted                  |
| Telemetry            | Real outbox; transport is a mock                 |
| Activation           | Real controller; gateway is a mock               |

Swapping the fakes for a real audio backend, HTTP transport, health-probe and
activation backend is the integration work that follows — the interfaces are
already the seams for it.
