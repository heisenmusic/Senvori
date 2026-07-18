# ADR 0004 — Telemetry ingestion & idempotency

- **Status:** Accepted (Sprint 10A)
- **Context:** A Player accumulates operational events offline and flushes them
  in batches when reconnected. The network is at-least-once: the same event may
  arrive more than once. Ingestion must never double-count, must bound work per
  request, and must fit the existing partitioned analytics event tables.

## Decision

1. **Device-generated event id = idempotency key.** Every event carries an
   `eventId` minted on the device. The analytics event tables already use a
   composite PK `(id, occurred_at)` for exactly this reason.
2. **Insert-or-ignore.** Ingestion uses `INSERT … ON CONFLICT DO NOTHING … 
RETURNING id`. Newly returned ids are `accepted`; submitted-but-not-returned
   ids are `duplicate`. The response reports `acceptedIds`, `duplicateIds`,
   `rejectedIds` so the device can safely drop acknowledged events from its
   outbox — at-least-once + server dedup ⇒ effectively once.
3. **Bounded batches.** The `PlayerTelemetryBatchRequest` contract caps a batch
   at 200 events; oversized batches are rejected at the Zod boundary (400).
4. **Routing by shape.** Playback events with an `assetId` become
   `playback_events` rows (operational Proof-of-Play precursor); asset-less
   markers (emergency start/stop) are preserved in `device_metric_events`; error
   events go to `player_error_events`. Each `batchId` is recorded in
   `ingestion_batches` with its event/duplicate counts.
5. **Server-derived scope.** Tenant/unit/zone are stamped from the device
   credential, never from the payload.

## Consequences

- Replays are safe and observable (duplicates are reported, not hidden).
- The device outbox has a clear ACK contract to prune against (10B).
- These are operational events, **not** certified Proof of Play — no
  certification, sample-accuracy, or clock-skew reconciliation is claimed.
