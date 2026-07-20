/// Local configuration for the device⇄backend HTTP surface (Sprint 10B).
///
/// This is *not* a public contract — it is local wiring the operator supplies at
/// build/provisioning time (e.g. via `--dart-define`). The backend derives the
/// device's tenant/unit from its credential, so nothing tenant-specific lives
/// here — only the API origin and transport tuning.
library;

/// Wire contract version the Player speaks. Mirrors `PLAYER_CONTRACT_VERSION`
/// in `@senvori/contracts` (kept as a plain constant to avoid a cross-language
/// dependency; the backend tolerates minor drift and reports its own version).
const String kPlayerContractVersion = '1.0.0';

/// The API global prefix (`app.setGlobalPrefix("v1")` in the NestJS bootstrap).
const String kApiPrefix = 'v1';

final class PlayerBackendConfig {
  const PlayerBackendConfig({
    required this.baseUrl,
    this.connectTimeout = const Duration(seconds: 10),
    this.requestTimeout = const Duration(seconds: 30),
    this.downloadTimeout = const Duration(minutes: 5),
  });

  /// API origin, e.g. `https://api.senvori.example`. No trailing `/v1` — the
  /// client appends the versioned prefix per route.
  final String baseUrl;
  final Duration connectTimeout;
  final Duration requestTimeout;
  final Duration downloadTimeout;

  bool get isConfigured => baseUrl.trim().isNotEmpty;
}
