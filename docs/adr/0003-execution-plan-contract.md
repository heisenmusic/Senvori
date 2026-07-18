# ADR 0003 — Player execution-plan contract

- **Status:** Accepted (Sprint 10A)
- **Context:** The Player must fetch "what to play now" for its unit and download
  the referenced assets. Scheduling (which program), Programming (compiled item
  order) and Catalog (asset objects + signed URLs) already exist server-side. The
  device must not re-implement any of them, and must receive a downloadable,
  integrity-checkable plan.

## Decision

1. **One device endpoint, server-assembled.** `GET /v1/player/execution-plan`
   returns a `PlayerExecutionPlanResponse`: unit, timezone, local date, day
   window (UTC), base + effective plan hashes, emergency/fallback flags, ordered
   items, overlays, and **asset descriptors with signed, expiring download
   URLs + sha256 + size + content-type + duration**.
2. **Reuse, don't reimplement.** The Fleet module reuses the pure Scheduling
   resolver (`resolveSchedule`, `assembleEffectivePlan`, `selectLocalEventOverlays`)
   and the `SchedulingRepository`, plus the catalog `STORAGE` signer. The device's
   unit and timezone come from its credential; local date/time is computed in that
   timezone (DST-correct via `Intl`).
3. **Published order, not request-time recompilation.** Items come from the
   resolved published version's `resolved_items` (the compile-time output), not a
   fresh run of the fatigue/affinity/history compiler. This keeps the endpoint
   cheap and deterministic and honest about what it is.
4. **Integrity travels with the plan.** Every asset descriptor carries the
   rendition's sha256 and size so the device (10B) can verify downloads and never
   play a corrupt file.

## Consequences

- The device gets a single, self-contained, downloadable plan; hashes let it
  detect "nothing changed" cheaply.
- Overlays/campaigns/emergency are represented but 10A does not deep-resolve
  campaign pacing (out of scope) — documented as Partial.
- Signed URLs are short-lived (≥15 min); the plan's `expiresAt` matches, so the
  device re-fetches rather than reusing stale URLs.
- Full compiled-at-request plans (with per-request engine intelligence) can be
  layered later without changing the wire contract.
