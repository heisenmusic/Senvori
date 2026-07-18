/// Local player configuration & feature flags (Sprint 09 · §56–§57).
///
/// Config is local (or fixture-typed) this sprint; a remote-config contract is
/// *prepared* but not wired to any backend. Flags that must stay off for
/// honesty — hard sync, proof-of-play transport — default to false and are
/// documented as such.
library;

/// Presentation modes (Sprint 09 · §25). Kept distinct; never merged into one
/// screen.
enum PlayerMode { ambient, operational, diagnostics }

/// How much motion the UI applies. `reduced` honours accessibility settings.
enum AnimationLevel { reduced, standard, expressive }

final class FeatureFlags {
  const FeatureFlags({
    this.demoMode = false,
    this.audioPlayback = true,
    this.localOverlays = true,
    this.emergencyRuntime = true,
    this.diagnostics = true,
    this.advancedAnimations = true,
    this.ambientVisualizer = true,
    // Must remain OFF this sprint — no real infrastructure exists.
    this.hardSync = false,
    this.proofOfPlayTransport = false,
  });

  final bool demoMode;
  final bool audioPlayback;
  final bool localOverlays;
  final bool emergencyRuntime;
  final bool diagnostics;
  final bool advancedAnimations;
  final bool ambientVisualizer;
  final bool hardSync;
  final bool proofOfPlayTransport;

  FeatureFlags copyWith({
    bool? demoMode,
    bool? advancedAnimations,
    bool? diagnostics,
  }) => FeatureFlags(
    demoMode: demoMode ?? this.demoMode,
    audioPlayback: audioPlayback,
    localOverlays: localOverlays,
    emergencyRuntime: emergencyRuntime,
    diagnostics: diagnostics ?? this.diagnostics,
    advancedAnimations: advancedAnimations ?? this.advancedAnimations,
    ambientVisualizer: ambientVisualizer,
    hardSync: hardSync,
    proofOfPlayTransport: proofOfPlayTransport,
  );
}

/// Runtime-tunable policy, mirroring the *prepared* remote-config contract.
final class PlayerConfig {
  const PlayerConfig({
    this.maxVolume = 1.0,
    this.autoplay = true,
    this.kioskMode = false,
    this.animationLevel = AnimationLevel.standard,
    this.cacheLimitBytes = 4 * 1024 * 1024 * 1024,
    this.downloadConcurrency = 2,
    this.localControlsEnabled = false,
    this.softSyncToleranceMs = 2000,
    this.flags = const FeatureFlags(),
  });

  final double maxVolume;
  final bool autoplay;
  final bool kioskMode;
  final AnimationLevel animationLevel;
  final int cacheLimitBytes;
  final int downloadConcurrency;

  /// By default a corporate player is not a personal one — local skip/pause is
  /// gated by policy (Sprint 09 · §32).
  final bool localControlsEnabled;
  final int softSyncToleranceMs;
  final FeatureFlags flags;

  PlayerConfig copyWith({
    double? maxVolume,
    AnimationLevel? animationLevel,
    FeatureFlags? flags,
    bool? kioskMode,
  }) => PlayerConfig(
    maxVolume: maxVolume ?? this.maxVolume,
    autoplay: autoplay,
    kioskMode: kioskMode ?? this.kioskMode,
    animationLevel: animationLevel ?? this.animationLevel,
    cacheLimitBytes: cacheLimitBytes,
    downloadConcurrency: downloadConcurrency,
    localControlsEnabled: localControlsEnabled,
    softSyncToleranceMs: softSyncToleranceMs,
    flags: flags ?? this.flags,
  );
}
