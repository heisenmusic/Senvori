import 'dart:async';

import '../../core/logging/logger.dart';
import '../../core/time/clock.dart';
import '../plan_runtime/plan.dart';
import '../queue/execution_queue.dart';
import 'playback_engine.dart';

/// What the UI observes: the current and next items, whether an emergency is
/// active, and whether the orchestrator has degraded after repeated failures.
final class OrchestratorSnapshot {
  const OrchestratorSnapshot({
    required this.current,
    required this.next,
    required this.emergencyActive,
    required this.degraded,
    required this.playback,
  });

  final PlanItem? current;
  final PlanItem? next;
  final bool emergencyActive;
  final bool degraded;
  final PlaybackSnapshot playback;

  static const idle = OrchestratorSnapshot(
    current: null,
    next: null,
    emergencyActive: false,
    degraded: false,
    playback: PlaybackSnapshot.idle,
  );
}

/// Deterministic playback orchestrator (Sprint 09 · §21). It owns the queue,
/// resolves each item to a local file, drives the engine, advances on
/// completion, recovers from item failures with bounded retries, and gives
/// emergency content absolute priority over the base rotation.
///
/// All timing comes from injected clocks; the engine is a port. There is no
/// `DateTime.now()` and no real audio here, so every transition below is
/// exercised deterministically in tests.
final class PlaybackOrchestrator {
  PlaybackOrchestrator({
    required AudioPlaybackEngine engine,
    required Logger logger,
    required MonotonicClock monotonic,
    required String? Function(String assetId) resolveLocalPath,
    this.maxItemAttempts = 2,
    this.maxConsecutiveFailures = 5,
  }) : _engine = engine,
       _logger = logger,
       _monotonic = monotonic,
       _resolveLocalPath = resolveLocalPath {
    _sub = _engine.snapshots.listen(_onSnapshot);
  }

  final AudioPlaybackEngine _engine;
  final Logger _logger;
  // Retained for elapsed-time reasoning in future soft-sync work; kept injected
  // so no wall-clock leaks into playback timing.
  // ignore: unused_field
  final MonotonicClock _monotonic;
  final String? Function(String assetId) _resolveLocalPath;
  final int maxItemAttempts;
  final int maxConsecutiveFailures;

  late final StreamSubscription<PlaybackSnapshot> _sub;
  final _controller = StreamController<OrchestratorSnapshot>.broadcast();

  ExecutionQueue? _queue;
  List<PlanItem> _emergencyItems = const [];
  bool _emergencyActive = false;
  int _emergencyIndex = 0;
  bool _degraded = false;
  int _consecutiveFailures = 0;

  Stream<OrchestratorSnapshot> get snapshots => _controller.stream;
  bool get emergencyActive => _emergencyActive;
  bool get degraded => _degraded;
  PlanItem? get currentItem => _emergencyActive
      ? (_emergencyIndex < _emergencyItems.length
            ? _emergencyItems[_emergencyIndex]
            : null)
      : _queue?.current?.planItem;

  /// Loads a plan and starts playback from the first playable item. If the plan
  /// declares an emergency, it begins in emergency immediately.
  Future<void> loadPlan(PlayerPlan plan) async {
    _queue = ExecutionQueue(plan);
    _emergencyItems = plan.emergencyItems;
    _emergencyActive = false;
    _emergencyIndex = 0;
    _degraded = false;
    _consecutiveFailures = 0;
    if (plan.emergencyActive && _emergencyItems.isNotEmpty) {
      await enterEmergency(_emergencyItems);
    } else {
      await _prepareAndPlayCurrent();
    }
  }

  /// Interrupts the base rotation and takes over with emergency content. The
  /// base position is not resumed sample-accurately (not supported) — on exit
  /// the base simply continues from its current queue item.
  Future<void> enterEmergency(List<PlanItem> items) async {
    if (items.isEmpty) return;
    _emergencyItems = items;
    _emergencyActive = true;
    _emergencyIndex = 0;
    _logger.warning(LogEvent.emergencyStarted, {'items': items.length});
    _logger.info(LogEvent.playbackInterrupted, {'reason': 'emergency'});
    _queue?.markCurrent(QueueItemState.interrupted);
    await _prepareAndPlayEmergency();
  }

  /// Ends emergency and returns to the base rotation at its current item.
  Future<void> exitEmergency() async {
    if (!_emergencyActive) return;
    _emergencyActive = false;
    _emergencyIndex = 0;
    _logger.info(LogEvent.emergencyEnded, const {});
    await _prepareAndPlayCurrent();
  }

  Future<void> _prepareAndPlayCurrent() async {
    final item = _queue?.current?.planItem;
    if (item == null) {
      _emit();
      return;
    }
    await _prepareAndPlay(item, isEmergency: false);
  }

  Future<void> _prepareAndPlayEmergency() async {
    if (_emergencyIndex >= _emergencyItems.length) {
      // Emergency content exhausted — loop it until explicitly cleared, since an
      // emergency must never fall silent while active.
      _emergencyIndex = 0;
    }
    final item = _emergencyItems[_emergencyIndex];
    await _prepareAndPlay(item, isEmergency: true);
  }

  Future<void> _prepareAndPlay(
    PlanItem item, {
    required bool isEmergency,
  }) async {
    final assetId = item.assetId;
    // Policy-only items (null asset) are treated as instantly-complete no-ops so
    // the timeline keeps moving.
    if (assetId == null) {
      await _onItemFinished(isEmergency: isEmergency);
      return;
    }
    final path = _resolveLocalPath(assetId);
    if (path == null) {
      // Asset not ready: skip forward rather than stalling. The cache subsystem
      // is independently fetching it; a later cycle will pick it up.
      _logger.warning(LogEvent.playbackFailed, {
        'itemId': item.id,
        'reason': 'asset_not_ready',
      });
      if (!isEmergency) {
        _queue?.markCurrent(QueueItemState.skipped, errorCode: 'asset.missing');
      }
      await _onItemFinished(isEmergency: isEmergency);
      return;
    }
    if (!isEmergency) {
      _queue?.markCurrent(QueueItemState.preparing, incrementAttempt: true);
    }
    await _engine.prepare(
      PlayableItem(
        itemId: item.id,
        localPath: path,
        title: item.title,
        artist: item.artist,
        duration: item.duration.inMilliseconds > 0 ? item.duration : null,
      ),
    );
  }

  void _onSnapshot(PlaybackSnapshot snap) {
    switch (snap.status) {
      case PlaybackStatus.ready:
        _engine.play();
        if (!_emergencyActive) _queue?.markCurrent(QueueItemState.playing);
        _logger.info(LogEvent.playbackStarted, {'itemId': snap.itemId});
      case PlaybackStatus.completed:
        _logger.info(LogEvent.playbackCompleted, {'itemId': snap.itemId});
        _consecutiveFailures = 0;
        if (!_emergencyActive) _queue?.markCurrent(QueueItemState.completed);
        unawaited(_onItemFinished(isEmergency: _emergencyActive));
      case PlaybackStatus.error:
        unawaited(_onItemError(snap));
      case PlaybackStatus.playing:
      case PlaybackStatus.paused:
      case PlaybackStatus.preparing:
      case PlaybackStatus.idle:
        break;
    }
    _emit(playback: snap);
  }

  Future<void> _onItemError(PlaybackSnapshot snap) async {
    _logger.warning(LogEvent.playbackFailed, {
      'itemId': snap.itemId,
      'code': snap.errorCode,
    });
    if (_emergencyActive) {
      // Emergency item failed: try the next emergency item so we don't fall
      // silent during an emergency.
      _emergencyIndex++;
      _consecutiveFailures++;
      if (_consecutiveFailures >= maxConsecutiveFailures) {
        _degraded = true;
        _emit();
        return;
      }
      await _prepareAndPlayEmergency();
      return;
    }
    final q = _queue;
    final cur = q?.current;
    if (cur != null && cur.attempts < maxItemAttempts) {
      // Bounded retry of the same item.
      await _prepareAndPlay(cur.planItem, isEmergency: false);
      return;
    }
    q?.markCurrent(QueueItemState.failed, errorCode: snap.errorCode);
    _consecutiveFailures++;
    if (_consecutiveFailures >= maxConsecutiveFailures) {
      _degraded = true;
      _logger.error(LogEvent.playbackFailed, {
        'reason': 'too_many_consecutive_failures',
      });
      _emit();
      return;
    }
    await _onItemFinished(isEmergency: false);
  }

  Future<void> _onItemFinished({required bool isEmergency}) async {
    if (isEmergency) {
      _emergencyIndex++;
      await _prepareAndPlayEmergency();
      return;
    }
    final next = _queue?.advance();
    if (next == null) {
      _emit();
      return;
    }
    await _prepareAndPlayCurrent();
  }

  void _emit({PlaybackSnapshot? playback}) {
    if (_controller.isClosed) return;
    _controller.add(
      OrchestratorSnapshot(
        current: currentItem,
        next: _emergencyActive ? null : _queue?.peekNext()?.planItem,
        emergencyActive: _emergencyActive,
        degraded: _degraded,
        playback: playback ?? _engine.snapshot,
      ),
    );
  }

  Future<void> dispose() async {
    await _sub.cancel();
    await _controller.close();
  }
}
