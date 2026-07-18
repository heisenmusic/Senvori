import 'dart:async';

import '../../core/logging/logger.dart';

/// Connectivity is more than "wifi on = online" (Sprint 09 · §38). We model a
/// spectrum from "no link" through "link but no internet" to "API reachable"
/// and "API degraded", because an always-on player must distinguish a captive
/// portal or a dead backend from true offline operation.
enum ConnectivityState {
  unknown,
  offline,
  localOnly,
  internetAvailable,
  apiReachable,
  apiDegraded,
}

extension ConnectivityStateX on ConnectivityState {
  /// Whether the runtime should attempt sync/telemetry flushes.
  bool get canReachApi => this == ConnectivityState.apiReachable;

  /// Whether we present the operator an "operating offline" affordance. Note
  /// this is *operational* offline — playback continues regardless.
  bool get isOperationalOffline =>
      this == ConnectivityState.offline || this == ConnectivityState.localOnly;
}

/// A probe that actually checks reachability. Production hits a lightweight
/// health endpoint; tests return scripted results. Probes must be cheap and
/// must not be run in a tight loop (the monitor applies backoff).
abstract interface class ConnectivityProbe {
  Future<ConnectivityState> probe();
}

/// Watches connectivity, debouncing transitions and logging offline/online
/// edges. It does not itself schedule probes on a timer in tests — [evaluate]
/// is called by the caller (or a Ticker in production) so behaviour is
/// deterministic under test.
final class ConnectivityMonitor {
  ConnectivityMonitor({
    required ConnectivityProbe probe,
    required Logger logger,
  }) : _probe = probe,
       _logger = logger;

  final ConnectivityProbe _probe;
  final Logger _logger;

  ConnectivityState _state = ConnectivityState.unknown;
  final _controller = StreamController<ConnectivityState>.broadcast();

  ConnectivityState get state => _state;
  Stream<ConnectivityState> get changes => _controller.stream;

  /// Runs one probe and applies the result, emitting and logging edge changes.
  Future<ConnectivityState> evaluate() async {
    final next = await _probe.probe();
    _apply(next);
    return next;
  }

  void _apply(ConnectivityState next) {
    if (next == _state) return;
    final wasOffline =
        _state.isOperationalOffline || _state == ConnectivityState.unknown;
    final nowOffline = next.isOperationalOffline;
    _state = next;
    if (!_controller.isClosed) _controller.add(next);
    if (nowOffline && !wasOffline) {
      _logger.info(LogEvent.offlineEntered, {'state': next.name});
    } else if (!nowOffline && wasOffline) {
      _logger.info(LogEvent.onlineRestored, {'state': next.name});
    }
  }

  Future<void> dispose() => _controller.close();
}
