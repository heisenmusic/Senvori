import 'dart:async';

import 'playback_engine.dart';

/// A deterministic, clock-driven engine used by the runtime for tests, the soak
/// harness and demo mode. It does not emit audio; it advances a virtual
/// position when [tick] is called, so tests control time exactly. In production
/// this is swapped for a real audio backend behind the same interface.
///
/// It can be told to fail preparing a specific item, to exercise playback-error
/// recovery paths without any real IO.
final class FakePlaybackEngine implements AudioPlaybackEngine {
  FakePlaybackEngine({Set<String>? failItemIds})
    : _failItemIds = failItemIds ?? {};

  final Set<String> _failItemIds;
  final _controller = StreamController<PlaybackSnapshot>.broadcast();
  PlaybackSnapshot _snapshot = PlaybackSnapshot.idle;

  @override
  Stream<PlaybackSnapshot> get snapshots => _controller.stream;

  @override
  PlaybackSnapshot get snapshot => _snapshot;

  /// Number of times each item has been prepared — used by tests to assert the
  /// orchestrator advanced (and did not accidentally loop).
  final Map<String, int> prepareCounts = {};

  @override
  Future<void> prepare(PlayableItem item) async {
    prepareCounts[item.itemId] = (prepareCounts[item.itemId] ?? 0) + 1;
    if (_failItemIds.contains(item.itemId)) {
      _emit(
        _snapshot.copyWith(
          status: PlaybackStatus.error,
          itemId: item.itemId,
          errorCode: 'engine.prepare_failed',
          position: Duration.zero,
          duration: Duration.zero,
        ),
      );
      return;
    }
    _emit(
      PlaybackSnapshot(
        status: PlaybackStatus.ready,
        position: Duration.zero,
        duration: item.duration ?? const Duration(minutes: 3),
        volume: _snapshot.volume,
        itemId: item.itemId,
      ),
    );
  }

  @override
  Future<void> play() async {
    if (_snapshot.status == PlaybackStatus.ready ||
        _snapshot.status == PlaybackStatus.paused) {
      _emit(_snapshot.copyWith(status: PlaybackStatus.playing));
    }
  }

  @override
  Future<void> pause() async {
    if (_snapshot.status == PlaybackStatus.playing) {
      _emit(_snapshot.copyWith(status: PlaybackStatus.paused));
    }
  }

  @override
  Future<void> stop() async {
    _emit(
      _snapshot.copyWith(status: PlaybackStatus.idle, position: Duration.zero),
    );
  }

  @override
  Future<void> seek(Duration position) async {
    _emit(_snapshot.copyWith(position: position));
  }

  @override
  Future<void> setVolume(double volume) async {
    _emit(_snapshot.copyWith(volume: volume.clamp(0.0, 1.0)));
  }

  /// Advances virtual playback by [by]. When the position reaches the duration,
  /// the snapshot transitions to `completed` exactly once. This is the only way
  /// the fake engine makes progress, so time is fully controlled by the test.
  void tick(Duration by) {
    if (_snapshot.status != PlaybackStatus.playing) return;
    final next = _snapshot.position + by;
    if (next >= _snapshot.duration) {
      _emit(
        _snapshot.copyWith(
          position: _snapshot.duration,
          status: PlaybackStatus.completed,
        ),
      );
    } else {
      _emit(_snapshot.copyWith(position: next));
    }
  }

  void _emit(PlaybackSnapshot s) {
    _snapshot = s;
    if (!_controller.isClosed) _controller.add(s);
  }

  @override
  Future<void> dispose() => _controller.close();
}
