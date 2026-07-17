# Player Offline-First

Offline-first is not "show a no-wifi icon". The Player must keep operating when
the network drops, DNS fails, a request times out, the API errors, or the device
reboots with no connection.

## Connectivity is a spectrum (`features/connectivity/`)

```
unknown · offline · localOnly · internetAvailable · apiReachable · apiDegraded
```

`localOnly`/`offline` are _operationally offline_ — playback continues. Only
`apiReachable` permits sync/telemetry flushes. The monitor debounces transitions
and logs `offline_entered` / `online_restored` edges. Probing is caller-driven
(or timer-driven in production) so tests are deterministic; production applies
backoff with jitter so a fleet does not reconnect in lockstep after an outage.

## Three plan slots (`features/plan_runtime/plan_store.dart`)

```
lastKnownGood — newest valid + runnable plan; persisted; survives restarts
pending       — freshly received, validated; assets still being prepared
active        — what the orchestrator runs right now
```

Rules the store enforces (all unit-tested):

1. An invalid plan is rejected and touches no slot.
2. A received plan enters `pending`; it becomes `active` only after explicit
   activation (caller confirms asset readiness).
3. Activation preserves the previous plan as `lastKnownGood`.
4. A sync/network failure never destroys the active plan.
5. Corrupted persisted state is **surfaced, not thrown**, and leaves slots empty
   — no crash loop, no silent wipe.

## The restart proof (tested)

`test/integration/scenarios_test.dart` Scenario 2:

```
online → receive & activate plan → dispose (app closes)
── new process over the SAME persisted backend, now OFFLINE ──
boot → restores plan from disk → lifecycle = offlineOperational → keeps playing
```

Plus the store-level test `offline restart: a new store instance restores the
persisted plan and boots active`, and the corruption test.

## Persistence (`core/persistence/`)

Every stored document is an envelope `{schemaVersion, data}`, enabling local
migrations. `FileKeyValueStore` writes atomically (temp file + rename) so a crash
mid-write never corrupts the previous value. Decode failures raise
`FormatException`, which callers convert into a recovery policy (start without
cache) rather than a fatal error.
