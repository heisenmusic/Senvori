/// Playback engine abstraction (Sprint 09 · §20).
///
/// The engine is a narrow port over "prepare a file, play it, tell me where it
/// is". It is deliberately small and platform-agnostic: the orchestrator and UI
/// depend only on this interface, never on a concrete audio backend. A real
/// implementation (e.g. `just_audio`/`media_kit`) is a future integration; this
/// sprint ships the contract plus a deterministic in-memory engine used for the
/// runtime, tests and demo mode.
///
/// Honesty note: crossfade, gapless, ducking and sample-accurate sync are NOT
/// implemented here. The contract exposes volume and a basic fade hook only.
library;

enum PlaybackStatus {
  idle,
  preparing,
  ready,
  playing,
  paused,
  completed,
  error,
}

/// A playable, resolved item: a local file the engine can open.
final class PlayableItem {
  const PlayableItem({
    required this.itemId,
    required this.localPath,
    required this.title,
    this.artist,
    this.duration,
  });

  final String itemId;
  final String localPath;
  final String title;
  final String? artist;
  final Duration? duration;
}

/// Immutable snapshot of the engine's state, emitted on the snapshots stream.
final class PlaybackSnapshot {
  const PlaybackSnapshot({
    required this.status,
    required this.position,
    required this.duration,
    required this.volume,
    this.itemId,
    this.errorCode,
  });

  final PlaybackStatus status;
  final Duration position;
  final Duration duration;
  final double volume;
  final String? itemId;
  final String? errorCode;

  static const idle = PlaybackSnapshot(
    status: PlaybackStatus.idle,
    position: Duration.zero,
    duration: Duration.zero,
    volume: 1.0,
  );

  bool get isCompleted => status == PlaybackStatus.completed;

  PlaybackSnapshot copyWith({
    PlaybackStatus? status,
    Duration? position,
    Duration? duration,
    double? volume,
    String? itemId,
    String? errorCode,
  }) => PlaybackSnapshot(
    status: status ?? this.status,
    position: position ?? this.position,
    duration: duration ?? this.duration,
    volume: volume ?? this.volume,
    itemId: itemId ?? this.itemId,
    errorCode: errorCode ?? this.errorCode,
  );
}

abstract interface class AudioPlaybackEngine {
  Stream<PlaybackSnapshot> get snapshots;
  PlaybackSnapshot get snapshot;

  Future<void> prepare(PlayableItem item);
  Future<void> play();
  Future<void> pause();
  Future<void> stop();
  Future<void> seek(Duration position);
  Future<void> setVolume(double volume);
  Future<void> dispose();
}
