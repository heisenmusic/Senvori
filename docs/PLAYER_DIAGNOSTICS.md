# Player Diagnostics

A protected mode for support (`features/diagnostics/diagnostics_screen.dart`),
distinct from Now Playing — it never pollutes the main screen (§25, §34).

## Shown

Masked device id, unit, tenant, app & schema version, active/base/effective plan
hash, last sync, connectivity, disk, assets, queue, uptime, platform, and recent
structured events.

## Never shown

Tokens, secrets, full signed URLs, other tenants' data, credentials, crypto
material. The device id is masked (`dev_ab…9f`). `DiagnosticsData.toReport()`
produces an already-sanitized, copyable text report.

## Logging (`core/logging/logger.dart`)

Structured events with a closed vocabulary (`LogEvent`) and levels
(debug/info/warning/error/fatal). A central `_sanitize` step redacts any field
that looks like a secret and trims signed URLs to their origin — applied once, so
diagnostics and telemetry inherit it. A bounded `RingBufferSink` backs the
recent-events view for an always-on device.

A widget test asserts the diagnostics screen renders sanitized rows and shows no
`token` text.
