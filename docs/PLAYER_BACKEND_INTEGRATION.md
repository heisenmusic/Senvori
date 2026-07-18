# Player ↔ Backend Integration (Sprint 10A + 10B)

Status: **Partial → adapters implemented (10B), unverified on device.** Sprint
10A delivered the **backend integration foundation** (contracts, API, schema,
SDK, dashboard) with real Postgres tests. **Sprint 10B** now implements the
Flutter Player adapters that consume this surface — authenticated HTTP,
activation gateway, execution-plan fetch/mapping, HTTP asset download with
real **SHA-256** verification, heartbeat, telemetry, connectivity probe and a
sync cycle — all dependency-free (`dart:io`, no new pub packages). Two adapters
remain fakes by necessity: **real audio** (needs an audio plugin) and
**OS-Keystore secure storage** (needs `flutter_secure_storage`); the token is
persisted app-private instead. The 10B adapters could **not** be run against a
live backend or on Android in this environment (no Flutter toolchain), so their
pure logic is unit-tested but nothing is "verified on device". Nothing here is
"Proof of Play certified"; Hard Sync remains out of scope. See ADR 0005 and
`PROJECT_STATUS.md`.

## What this sprint connected

```
Backend / Scheduling → Activation / Fleet → Execution Plan
    → (10B) Asset Download → Real Audio → Telemetry → Backend Ingestion
```

10A implements every backend link above the "(10B)" line, device-authenticated
and tenant-isolated. A device can be activated by a real operator, fetch its
effective plan with signed asset URLs, heartbeat, and emit idempotent
operational playback events — all against a real API + Postgres. The Player app
that drives these calls arrives in 10B.

## Schema reuse (no duplicate tables)

The pre-existing **Fleet** and **Analytics** schemas already modelled almost
everything needed. 10A extends them additively (migration `0011`) instead of
creating `player_*` duplicates:

| Concern               | Table                                                   | 10A change                                                                                                                               |
| --------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Device                | `devices`                                               | reused as-is (binds to a `zone`; unit = `zones.unit_id`)                                                                                 |
| Activation code       | `pairing_codes` (no RLS by design)                      | + `status`, `activation_secret_hash`, `zone_id`, `claimed_by/at`, `completed_at`                                                         |
| Credential            | `device_tokens` (RLS)                                   | + `last_used_at` and a `device_tokens_self_auth` SELECT policy                                                                           |
| Heartbeat (hot)       | `heartbeat_statuses` (RLS)                              | + `runtime_state`, `connectivity`, `effective_plan_hash`, `current_item_id`, `last_error`, `storage`, `last_sync_at`, `contract_version` |
| Heartbeat (history)   | `device_metric_events` (partitioned)                    | reused                                                                                                                                   |
| Execution events      | `playback_events` (partitioned, PK `(id, occurred_at)`) | reused — id = device idempotency key                                                                                                     |
| Runtime errors        | `player_error_events` (partitioned)                     | reused                                                                                                                                   |
| Ingestion bookkeeping | `ingestion_batches`                                     | reused                                                                                                                                   |
| Permissions           | `fleet:device:{read,pair,manage}`                       | reused                                                                                                                                   |

## Device authentication (§4.2)

The API connects as a **NOBYPASSRLS** role under **FORCE RLS**, so a device
credential must be verifiable _before_ the tenant is known. The
`device_tokens_self_auth` RLS policy permits reading exactly the row whose
`token_hash` the caller presents via the transaction-local `app.device_token_hash`
GUC — only the holder of the raw token can read its row; every other path stays
tenant-isolated. `DeviceAuthGuard` hashes the bearer token, looks it up, checks
`revoked_at`/`expires_at`, then loads the device + zone → unit inside the derived
tenant context and attaches a server-derived `DeviceContext`. **A device never
sends its tenant/unit.**

## Activation flow (§4.1) — proof of possession

| Step       | Caller   | Endpoint                                 | Effect                                                                                                                             |
| ---------- | -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| start      | device   | `POST /v1/player/activation/start`       | stores `sha256(activationSecret)`; returns a short code + expiry                                                                   |
| claim      | operator | `POST /v1/fleet/activations/:code/claim` | RBAC `fleet:device:pair`; creates the `devices` row bound to a zone; marks the code `claimed`. **Does not mint the token.**        |
| poll       | device   | `GET /v1/player/activation/:code`        | returns status only (no secrets)                                                                                                   |
| complete   | device   | `POST /v1/player/activation/complete`    | verifies the raw secret against the stored hash; mints a token, stores only its hash, returns the raw token **once**. Replay ⇒ 409 |
| refresh    | device   | `POST /v1/player/session/refresh`        | rotates (revoke-all + issue)                                                                                                       |
| deactivate | device   | `POST /v1/player/deactivate`             | revokes credentials, decommissions                                                                                                 |

The raw activation secret never travels (only its hash); knowledge of the code
alone cannot claim a credential. Single-use (`status`+`completed_at`), expiring
(`expires_at`), replay-protected (409 on completed), tenant-isolated, audited.

## Effective execution plan (§4.4)

`GET /v1/player/execution-plan` (device-authenticated) returns the effective
plan for the device's unit, now: it reuses the pure Scheduling resolver (which
program plays) + the **published** version's resolved item order + local-event
overlays + emergency state + plan hashes, and enriches each referenced asset
with a **signed, expiring download descriptor** (URL, sha256, size, content-type,
duration). Honesty: it serves the _published resolved order_; it does not re-run
the full deterministic compiler (fatigue/affinity/history) at request time — that
stays the publish-time responsibility.

## Heartbeat (§4.8) & telemetry (§4.9)

- `POST /v1/player/heartbeat` upserts the `heartbeat_statuses` hot projection and
  appends to `device_metric_events`. Carries only operational data — never
  tokens, paths, or stack traces.
- `POST /v1/player/telemetry` ingests a bounded batch (≤200 events) of playback
  and/or error events. Idempotent: `ON CONFLICT DO NOTHING` on the composite PK
  keyed by the device-generated `eventId`; the response reports
  accepted/duplicate/rejected. `ingestion_batches` records each batch.

## Admin surface (§8)

`GET /v1/fleet/devices`, `GET /v1/fleet/devices/:id`,
`POST /v1/fleet/devices/:id/revoke`, `GET /v1/fleet/devices/:id/playback-events`,
`GET /v1/fleet/activations/:code`. Human RBAC, tenant-scoped, **no secrets** —
only credential presence. The dashboard renders Device Activation + Detail.

## Security notes

- Tokens are stored only as sha256 hashes; the raw token is returned once
  (complete/refresh) and never logged.
- The device cannot choose `tenant_id`/`unit_id`; scope is derived server-side.
- Cross-tenant access is denied by RLS and verified in tests.
- Rate limiting: the global `@fastify/rate-limit` covers the public activation
  endpoints (a dedicated per-code limiter is a 10B/ops follow-up).

## Tests

`apps/api/test/player.spec.ts` — 13 integration tests on real Postgres:
activation happy path, replay/single-use, secret mismatch, claim-before-complete,
RBAC + cross-tenant denial, device auth (valid/forged/missing/revoked), heartbeat
→ admin detail, effective plan with items + signed assets, idempotent telemetry
with dedup + cross-tenant isolation, oversized-batch rejection, token rotation,
device listing. Plus 12 contract unit tests in `@senvori/contracts`.

## Phase 10B (Flutter adapters) — implemented

Now implemented as dependency-free adapters (`apps/player/lib/features/net/**`,
`core/crypto/**`, `core/persistence/token_store.dart`,
`app/production_factory.dart`):

| Adapter                    | Class                                    | Endpoint / concern                    |
| -------------------------- | ---------------------------------------- | ------------------------------------- |
| Authenticated HTTP         | `PlayerHttpClient`                       | bearer auth, `v1` prefix, timeouts    |
| SHA-256 integrity          | `Sha256Checksum` / `sha256.dart`         | asset verification (NIST vectors)     |
| Activation gateway         | `HttpActivationGateway`                  | start / status / complete             |
| Credential storage         | `DocumentTokenStore` (`TokenStore`)      | app-private file (not OS Keystore)    |
| Execution plan             | `ExecutionPlanGateway`                   | `GET /v1/player/execution-plan`       |
| Asset download             | `HttpAssetTransport`                     | signed-URL streaming                  |
| Telemetry                  | `HttpTelemetryTransport`                 | `POST /v1/player/telemetry`           |
| Heartbeat                  | `HeartbeatClient`                        | `POST /v1/player/heartbeat`           |
| Connectivity               | `HttpConnectivityProbe`                  | `GET /v1/health`                      |
| Sync cycle                 | `SyncCycle`                              | heartbeat → plan → telemetry loop     |
| Composition root           | `ProductionFactory`                      | wires all of the above                |

## Still deferred / follow-ups

Real audio engine (audio plugin + ADR), OS-Keystore-backed secure storage,
real disk-space query (needs a platform channel), activation-UI wiring to the
injected `ActivationController`, adaptive heartbeat interval, large-asset
file-streaming downloads, on-device diagnostics, APK build, and
emulator/hardware validation. See `PROJECT_STATUS.md` for the matrix.
