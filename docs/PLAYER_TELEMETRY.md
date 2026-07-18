# Player Telemetry & Proof-of-Play Foundation

> **Prepared telemetry. Not yet certified Proof of Play.** The word "proven"
> never appears in the UI.

## Outbox (`features/telemetry/outbox.dart`)

A durable, deduplicated event queue:

- **Persists before sending** — an event survives a crash between enqueue and
  flush.
- **Idempotency key** — the same logical event enqueued twice is stored once; a
  retry after an ambiguous send never double-counts.
- **Batch flush** — only keys the transport durably accepted are removed
  (at-least-once + server-side dedup ⇒ effectively once).
- **Bounded** — over capacity, oldest **non-critical** events (e.g. progress
  checkpoints) are dropped first; critical events are preserved.
- **Survives restart** — `restore()` reloads queued events.

Tests (`test/runtime/outbox_connectivity_test.dart`): dedup, partial/enabled
flush, restart persistence, and non-critical-first pruning. The soak test asserts
the outbox stays bounded and consistent over 24h simulated.

## Event kinds prepared (§37)

`planActivated, itemPrepared, playbackStarted, playbackProgress,
playbackCompleted, playbackFailed, playbackSkipped, playbackInterrupted,
emergencyPlayback` — each carries device/tenant/unit/plan-hash/item/asset/
timestamps/position/duration/reason/version/idempotency-key as applicable.

## Honesty

The default `MockTelemetryTransport` accepts nothing unless explicitly enabled —
proving the outbox persists and never loses data when there is no backend. No
real transport, and **no certified Proof of Play**, exists this sprint. Classify
these as _operational telemetry_. Status: telemetry **Partial**, certified Proof
of Play **Prepared**.
