# Player Execution Events (Sprint 10A)

Status: **Partial (operational events, not certified Proof of Play).**

Operational playback events are real, deduplicated execution records — **not** a
certified Proof of Play. We deliberately name them `playback_event` /
operational events and do not claim certification, sample-accurate timing, or
audit-grade completeness. Certified Proof of Play remains out of scope.

## Wire contract (`PlayerPlaybackEvent`)

Each event carries: `schemaVersion`, `eventId` (device-generated idempotency
key), `type`, `planVersion`, `effectivePlanHash`, `itemId`, `assetId`,
`startedAt`, `endedAt`, `positionMs`, `durationMs`, `completionPct`, `source`,
`reason`, `appVersion`. **Tenant/unit/zone scope is never sent** — the server
derives it from the device credential.

`type` ∈ `playback_started`, `playback_progress_checkpoint`,
`playback_completed`, `playback_skipped`, `playback_failed`,
`emergency_started`, `emergency_completed`.

## Ingestion & storage

- `POST /v1/player/telemetry` accepts a bounded batch (≤200) with a `batchId`.
- Events carrying an `assetId` are stored in `playback_events` (partitioned; PK
  `(id, occurred_at)`), with tenant/device/unit/zone stamped server-side.
- Asset-less markers (emergency start/stop) are preserved in
  `device_metric_events` so nothing is lost.
- Error events go to `player_error_events`.
- **Idempotency:** `ON CONFLICT DO NOTHING` on the composite PK keyed by the
  device `eventId`. Re-sending never double-counts. The response returns
  `acceptedIds` (newly stored), `duplicateIds` (already present), `rejectedIds`.
- `ingestion_batches` records `eventCount`, `duplicateCount`, and the batch
  window for audit.

## What is NOT here

- No certification, no sample-accurate timing, no clock-skew reconciliation
  beyond the existing `playback_events.clock_skew_ms` column (unused in 10A).
- No aggregation/rollups (Analytics is out of scope).
- The device-side outbox that _produces_ these batches is Phase 10B.
