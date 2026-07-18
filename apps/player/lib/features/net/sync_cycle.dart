/// The Player sync cycle (Sprint 10B).
///
/// One cohesive iteration of the online loop, kept free of concrete transport
/// types (it takes function-typed callbacks) so it is deterministic and testable
/// with fakes. Each [tick]:
///
///   1. evaluates connectivity — if the API is unreachable it returns
///      immediately (playback continues offline, nothing is destroyed);
///   2. sends a heartbeat and reads `planChanged`;
///   3. re-fetches the effective plan when there is no active plan or the server
///      signalled a change, applying it through the runtime's validate → stage →
///      ensure-assets → activate pipeline (a failed/incomplete fetch never
///      disturbs the active plan);
///   4. flushes queued telemetry.
///
/// A network failure at any step degrades gracefully rather than throwing.
library;

import '../../app/player_runtime.dart';
import '../../core/logging/logger.dart';
import '../../core/result/result.dart';
import 'execution_plan_gateway.dart';
import 'heartbeat_client.dart';

enum SyncResult { offline, degraded, synced, planApplied }

typedef SendHeartbeat = Future<HeartbeatResult> Function();
typedef FetchPlan = Future<Result<FetchedPlan>> Function();
typedef FlushTelemetry = Future<int> Function();

final class SyncCycle {
  SyncCycle({
    required PlayerRuntime runtime,
    required SendHeartbeat sendHeartbeat,
    required FetchPlan fetchPlan,
    required FlushTelemetry flushTelemetry,
    required Logger logger,
  }) : _runtime = runtime,
       _sendHeartbeat = sendHeartbeat,
       _fetchPlan = fetchPlan,
       _flushTelemetry = flushTelemetry,
       _logger = logger;

  final PlayerRuntime _runtime;
  final SendHeartbeat _sendHeartbeat;
  final FetchPlan _fetchPlan;
  final FlushTelemetry _flushTelemetry;
  final Logger _logger;

  /// Runs one full cycle. Never throws; failures are reflected in [SyncResult].
  Future<SyncResult> tick() async {
    final state = await _runtime.connectivity.evaluate();
    if (!state.canReachApi) return SyncResult.offline;

    var planApplied = false;
    var degraded = false;

    // Heartbeat — its planChanged flag is the primary re-fetch signal.
    var planChanged = false;
    try {
      final hb = await _sendHeartbeat();
      planChanged = hb.planChanged;
    } catch (_) {
      degraded = true;
    }

    // Fetch when we have no active plan yet, or the server signalled a change.
    final needPlan = _runtime.planStore.active == null || planChanged;
    if (needPlan && !degraded) {
      final result = await _fetchPlan();
      await result.fold(
        (fetched) async {
          final active = _runtime.planStore.active;
          if (active?.effectivePlanHash == fetched.plan.effectivePlanHash) {
            return; // already running this exact plan
          }
          final ok = await _runtime.applyPlan(
            fetched.plan,
            sourceUris: fetched.sourceUris,
            checksums: fetched.checksums,
          );
          planApplied = ok;
        },
        (err) async {
          degraded = true;
          _logger.warning(LogEvent.planRejected, {'code': err.code});
        },
      );
    }

    // Ship queued telemetry (best effort).
    try {
      await _flushTelemetry();
    } catch (_) {
      degraded = true;
    }

    if (planApplied) return SyncResult.planApplied;
    if (degraded) return SyncResult.degraded;
    return SyncResult.synced;
  }
}
