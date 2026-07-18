import 'dart:async';

import '../core/logging/logger.dart';
import '../core/time/clock.dart';

/// Explicit Player lifecycle (Sprint 09 · §9). The Player is a state machine,
/// not a bag of booleans. Each state carries a reason, a wall timestamp and a
/// monotonic marker; transitions are validated against an allow-list and
/// invalid transitions are logged and rejected (not silently applied).
enum PlayerLifecycleState {
  booting,
  awaitingActivation,
  loadingConfiguration,
  synchronizing,
  ready,
  playing,
  pausedByPolicy,
  offlineOperational,
  degraded,
  emergency,
  fatalError,
}

/// Allowed transitions. Absent edges are rejected. This table is the single
/// source of truth for how the Player may move between states.
const Map<PlayerLifecycleState, Set<PlayerLifecycleState>> _allowed = {
  PlayerLifecycleState.booting: {
    PlayerLifecycleState.awaitingActivation,
    PlayerLifecycleState.loadingConfiguration,
    PlayerLifecycleState.fatalError,
  },
  PlayerLifecycleState.awaitingActivation: {
    PlayerLifecycleState.loadingConfiguration,
    PlayerLifecycleState.fatalError,
  },
  PlayerLifecycleState.loadingConfiguration: {
    PlayerLifecycleState.synchronizing,
    PlayerLifecycleState.offlineOperational,
    PlayerLifecycleState.ready,
    PlayerLifecycleState.degraded,
    PlayerLifecycleState.fatalError,
  },
  PlayerLifecycleState.synchronizing: {
    PlayerLifecycleState.ready,
    PlayerLifecycleState.offlineOperational,
    PlayerLifecycleState.degraded,
    PlayerLifecycleState.emergency,
    PlayerLifecycleState.fatalError,
  },
  PlayerLifecycleState.ready: {
    PlayerLifecycleState.playing,
    PlayerLifecycleState.synchronizing,
    PlayerLifecycleState.offlineOperational,
    PlayerLifecycleState.pausedByPolicy,
    PlayerLifecycleState.emergency,
    PlayerLifecycleState.degraded,
  },
  PlayerLifecycleState.playing: {
    PlayerLifecycleState.ready,
    PlayerLifecycleState.pausedByPolicy,
    PlayerLifecycleState.synchronizing,
    PlayerLifecycleState.offlineOperational,
    PlayerLifecycleState.emergency,
    PlayerLifecycleState.degraded,
    PlayerLifecycleState.fatalError,
  },
  PlayerLifecycleState.pausedByPolicy: {
    PlayerLifecycleState.playing,
    PlayerLifecycleState.ready,
    PlayerLifecycleState.emergency,
    PlayerLifecycleState.offlineOperational,
  },
  PlayerLifecycleState.offlineOperational: {
    PlayerLifecycleState.playing,
    PlayerLifecycleState.ready,
    PlayerLifecycleState.synchronizing,
    PlayerLifecycleState.emergency,
    PlayerLifecycleState.degraded,
  },
  PlayerLifecycleState.degraded: {
    PlayerLifecycleState.synchronizing,
    PlayerLifecycleState.ready,
    PlayerLifecycleState.playing,
    PlayerLifecycleState.offlineOperational,
    PlayerLifecycleState.emergency,
    PlayerLifecycleState.fatalError,
  },
  PlayerLifecycleState.emergency: {
    // Emergency returns to whatever operational state preceded it.
    PlayerLifecycleState.playing,
    PlayerLifecycleState.ready,
    PlayerLifecycleState.offlineOperational,
    PlayerLifecycleState.degraded,
    PlayerLifecycleState.fatalError,
  },
  PlayerLifecycleState.fatalError: {
    // Only a full restart leaves fatal; modeled as a transition back to booting.
    PlayerLifecycleState.booting,
  },
};

final class LifecycleTransition {
  const LifecycleTransition({
    required this.from,
    required this.to,
    required this.reason,
    required this.at,
    required this.monotonic,
  });

  final PlayerLifecycleState from;
  final PlayerLifecycleState to;
  final String reason;
  final DateTime at;
  final Duration monotonic;
}

/// Owns the current state and enforces the transition table.
final class PlayerLifecycle {
  PlayerLifecycle({
    required Logger logger,
    required Clock clock,
    required MonotonicClock monotonic,
    PlayerLifecycleState initial = PlayerLifecycleState.booting,
  }) : _logger = logger,
       _clock = clock,
       _monotonic = monotonic,
       _state = initial,
       _enteredAt = clock.now(),
       _enteredMonotonic = monotonic.elapsed();

  final Logger _logger;
  final Clock _clock;
  final MonotonicClock _monotonic;

  PlayerLifecycleState _state;
  DateTime _enteredAt;
  Duration _enteredMonotonic;
  String _reason = 'init';

  final _controller = StreamController<PlayerLifecycleState>.broadcast();

  PlayerLifecycleState get state => _state;
  String get reason => _reason;
  DateTime get enteredAt => _enteredAt;
  Duration get timeInState => _monotonic.elapsed() - _enteredMonotonic;
  Stream<PlayerLifecycleState> get changes => _controller.stream;

  static bool canTransition(
    PlayerLifecycleState from,
    PlayerLifecycleState to,
  ) => from == to || (_allowed[from]?.contains(to) ?? false);

  /// Attempts a transition. Returns true if applied. A rejected transition is
  /// logged (never throws) so the Player degrades predictably rather than
  /// crashing on an unexpected event ordering.
  bool transition(PlayerLifecycleState to, {required String reason}) {
    if (to == _state) {
      _reason = reason;
      return true;
    }
    if (!canTransition(_state, to)) {
      _logger.warning(LogEvent.lifecycleTransitionRejected, {
        'from': _state.name,
        'to': to.name,
        'reason': reason,
      });
      return false;
    }
    final from = _state;
    _state = to;
    _reason = reason;
    _enteredAt = _clock.now();
    _enteredMonotonic = _monotonic.elapsed();
    _logger.info(LogEvent.lifecycleTransition, {
      'from': from.name,
      'to': to.name,
      'reason': reason,
    });
    if (!_controller.isClosed) _controller.add(to);
    return true;
  }

  Future<void> dispose() => _controller.close();
}
