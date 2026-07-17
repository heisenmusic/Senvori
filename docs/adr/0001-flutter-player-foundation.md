# ADR 0001 — Flutter Player foundation: runtime/experience split, ports, fake-first

- **Status:** Accepted (Sprint 09)
- **Context:** The Player is the operational face of Senvori and must run
  unattended for months on Android boxes, tablets and mini-PCs — offline-first,
  resilient, premium. No Flutter app existed; the monorepo is TypeScript.

## Decision

1. **Two layers.** A pure-Dart **runtime** (source of truth) and a Flutter
   **experience** layer that renders an immutable view-state. The UI never owns
   state, never touches storage/network/audio directly.
2. **Ports everywhere.** Clock, MonotonicClock, filesystem, download transport,
   checksum, connectivity probe, audio engine, activation gateway and telemetry
   transport are interfaces. Production and tests wire different adapters.
3. **Fake-first, honest.** This sprint ships real runtime logic against
   in-memory/fake infrastructure (fake audio engine, mock gateways, null
   transport), clearly labelled Demo Mode. The interfaces are the seams for real
   integrations later.
4. **Explicit lifecycle machine** with an allow-list; invalid transitions are
   rejected and logged, not applied.
5. **Last-known-good is sacred**; invalid/not-ready plans never replace the
   active plan; corruption is recoverable, never a crash loop.
6. **No `DateTime.now()` in logic** — clocks are injected so time-dependent
   behaviour is deterministic and soak-testable.
7. **Minimal dependencies** — only Flutter SDK + official localization packages,
   so the whole runtime is headless-testable without native plugins.

## Consequences

- The runtime is exhaustively unit/integration/soak testable without a device.
- Real audio, a production activation backend, an HTTP download transport, real
  disk-space queries and secure storage remain follow-ups — they slot behind the
  existing ports without touching playback logic.
- Hard Sync and certified Proof of Play stay **Prepared**; feature flags for them
  default off.
