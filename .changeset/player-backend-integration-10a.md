---
"@senvori/contracts": minor
"@senvori/sdk": minor
---

Player Production Integration — Phase 10A (backend foundation). Sprint 10 is
**Partial**: the Flutter Player adapters (Phase 10B) remain Not implemented.

Adds the device⇄backend contracts (`@senvori/contracts/domains/player`) and the
Fleet administration SDK surface (`client.fleet`). The API (`@senvori/api`) fills
the previously-empty Fleet module with device authentication (a
`device_tokens_self_auth` RLS policy usable under FORCE RLS + a NOBYPASSRLS app
role), proof-of-possession activation (start/claim/complete, single-use, replay-
protected, audited), session refresh/deactivate, heartbeat, an effective
execution plan with signed asset descriptors, and idempotent telemetry/playback
event ingestion — all tenant-isolated. Migration `0011` extends `pairing_codes`,
`device_tokens` and `heartbeat_statuses` additively and reuses existing
Fleet/Analytics tables (no `player_*` duplicates). The dashboard gains a minimal
Device Activation + Detail console. Verified with 13 API integration tests on
real Postgres and 12 contract unit tests.

Not certified Proof of Play; Hard Sync and full Fleet remain out of scope.
