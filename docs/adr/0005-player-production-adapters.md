# ADR 0005 — Player production adapters (Sprint 10B)

- **Status:** Accepted (Sprint 10B)
- **Context:** Sprint 09 shipped the Flutter Player as a pure-Dart, ports-and-
  adapters runtime where every piece of infrastructure (HTTP, filesystem,
  checksum, audio, connectivity, telemetry) was a fake/mock so the runtime was
  fully headless-testable and the app ran in an explicit **Demo Mode**. Sprint
  10A shipped the backend surface (activation, device-auth, execution plan,
  heartbeat, idempotent telemetry) against real Postgres. Sprint 10B connects
  the Player to that surface with real adapters — without regressing the
  dependency-free, headless-testable posture.

## Decision

1. **No new pub dependencies.** Production adapters are built on `dart:io`,
   `dart:convert`, `dart:typed_data` and `dart:math` only. This keeps
   `pubspec.lock` unchanged, keeps `flutter analyze`/`flutter test` fully
   headless, and keeps the transport swappable. Concretely:
   - **SHA-256** integrity is a pure-Dart FIPS 180-4 implementation
     (`core/crypto/sha256.dart`), replacing the non-cryptographic FNV-1a
     fallback for production wiring (`Sha256Checksum`). Verified against NIST
     known-answer vectors.
   - **Authenticated HTTP** (`PlayerHttpClient`) wraps `HttpClient`: origin +
     `v1` prefix resolution, JSON codec, lazy bearer auth via a `TokenProvider`,
     timeouts, and a uniform `PlayerHttpException`.
   - **Activation** (`HttpActivationGateway`) implements the Sprint 09
     `ActivationGateway` port over the real start/status/complete endpoints with
     proof-of-possession (only `sha256(secret)` travels).
   - **Execution plan** (`ExecutionPlanGateway`) fetches and maps the real
     `PlayerExecutionPlanResponse` into the domain `PlayerPlan` plus signed URLs
     and checksums.
   - **Downloads** (`HttpAssetTransport`) stream signed-URL bytes; **telemetry**
     (`HttpTelemetryTransport`) and **heartbeat** (`HeartbeatClient`) speak the
     contract; **connectivity** (`HttpConnectivityProbe`) pings `/v1/health`.
   - **Sync cycle** (`SyncCycle`) ties them together: connectivity → heartbeat →
     plan re-fetch on `planChanged` → telemetry flush, degrading gracefully.

2. **The token is a side effect, not a return value.** The `ActivationGateway`
   port returns descriptive `ActivationResult` (tenant/unit) only; the raw device
   token minted at `complete` is persisted via a `TokenStore` and read lazily by
   the HTTP client. It is never returned through the port, never logged.

3. **Audio stays a fake in production — deliberately.** Real gapless/ducked/
   sample-accurate audio needs a platform plugin (`just_audio`/`media_kit`) and a
   real audio device. The `AudioPlaybackEngine` port is unchanged; production
   injects `FakePlaybackEngine` until a plugin-backed adapter exists. The plan is
   fetched, validated, its assets downloaded and verified, and the orchestrator
   is driven — but no sound is produced. This is labelled, not hidden.

4. **Token storage is app-private file, not OS Keystore.** `DocumentTokenStore`
   persists the credential durably in app-private storage (a JSON file via
   `FileKeyValueStore`). Hardware-backed encryption (Android Keystore / iOS
   Keychain) needs `flutter_secure_storage`; until that adapter is wired,
   `DeviceCapabilities.secureStorage` stays `false`.

5. **Storage/cache roots are injected.** Resolving real app-private paths on
   device needs `path_provider` (a plugin). `ProductionFactory.build` takes the
   backend store and cache root from the caller; the `main` production entrypoint
   uses a system-temp fallback (honest for desktop/dev, a follow-up for hardened
   Android storage).

## Consequences

- The full online path — activate → authenticated calls → fetch plan → download
  + SHA-256 verify → validate/stage/activate → heartbeat → telemetry — is real
  code exercised by unit tests on its pure parts (SHA-256 vectors, plan mapping,
  telemetry/heartbeat codecs, URL resolution, sync-cycle branching).
- It could **not** be run end-to-end against a live backend or on Android in this
  environment (no Flutter toolchain, no reachable API), so nothing is claimed as
  "verified on device". See `PROJECT_STATUS.md` for the honest matrix.
- Audio output, OS-Keystore storage, real disk-space queries, an adaptive
  heartbeat interval, activation-UI wiring, and large-asset file-streaming
  downloads remain **Not implemented / follow-ups**, each documented where it
  lives rather than papered over.
