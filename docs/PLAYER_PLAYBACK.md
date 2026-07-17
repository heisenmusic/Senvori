# Player Playback

## Engine port (`features/playback/playback_engine.dart`)

A narrow, platform-agnostic interface: `prepare / play / pause / stop / seek /
setVolume / dispose` plus a `snapshots` stream of `PlaybackSnapshot`. The
orchestrator and UI depend only on this port.

**Honest limitations (not implemented this sprint):** crossfade, gapless,
ducking mixdown, sample-accurate sync, LUFS normalization, DSP. The contract
exposes volume and a basic fade hook only.

`FakePlaybackEngine` implements the port deterministically — it advances a
virtual position on `tick(...)` and can be told to fail specific items, so every
transition is exercised without real audio or IO.

## Orchestrator (`features/playback/playback_orchestrator.dart`)

Deterministic controller. Responsibilities and their tests:

- Resolve the current item, resolve its local file, prepare & play.
- On completion → advance the queue (rotates at end of day).
- On item error → bounded retry (`maxItemAttempts`), then mark failed/skipped and
  continue; a global `maxConsecutiveFailures` trips `degraded` to avoid loops.
- Asset not ready → skip forward, never stall (the cache is fetching it).
- **Emergency has absolute priority**: `enterEmergency` interrupts the base and
  takes over; `exitEmergency` returns to the base at its current item.

Timing is via injected clocks; there is no `DateTime.now()` and no real audio, so
`test/runtime/orchestrator_test.dart` drives play→complete→advance,
retry→skip→continue, not-ready→skip, plan-emergency, and interrupt→restore.

## Execution queue (`features/queue/execution_queue.dart`)

An ordered, observable list of `QueueItem`s over the plan's non-emergency items
(emergencies are held separately for priority). Each item has its own state
(`scheduled → preparing → ready → playing → completed / skipped / failed /
interrupted`). The UI may view the queue but never reorders it.

## Emergency (§23)

Emergency behaviour is real runtime, exercised in simulation
(`Scenario 6`): base plays → emergency arrives → base interrupted → emergency
assumes → emergency ends → base resumes. Not implemented: external public alert
networks, a priority network, or Hard Sync.
