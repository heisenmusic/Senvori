import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/app/runtime_factory.dart';
import 'package:senvori_player/core/errors/player_error.dart';
import 'package:senvori_player/core/logging/logger.dart';
import 'package:senvori_player/core/result/result.dart';
import 'package:senvori_player/core/time/clock.dart';
import 'package:senvori_player/features/connectivity/connectivity.dart';
import 'package:senvori_player/features/net/execution_plan_gateway.dart';
import 'package:senvori_player/features/net/heartbeat_client.dart';
import 'package:senvori_player/features/net/sync_cycle.dart';

HeartbeatResult _hb({bool planChanged = false}) =>
    HeartbeatResult(planChanged: planChanged, nextHeartbeatSeconds: 60);

void main() {
  group('SyncCycle', () {
    test('short-circuits when the API is unreachable', () async {
      final runtime = RuntimeFactory.demo(
        connectivity: ConnectivityState.offline,
      );
      var heartbeats = 0;
      var fetches = 0;
      final sync = SyncCycle(
        runtime: runtime,
        logger: Logger(FakeClock(DateTime.utc(2026))),
        sendHeartbeat: () async {
          heartbeats++;
          return _hb();
        },
        fetchPlan: () async {
          fetches++;
          return Err<FetchedPlan>(PlayerErrors.network('x'));
        },
        flushTelemetry: () async => 0,
      );

      expect(await sync.tick(), SyncResult.offline);
      expect(heartbeats, 0);
      expect(fetches, 0);
      await runtime.dispose();
    });

    test('degrades when the heartbeat fails', () async {
      final runtime = RuntimeFactory.demo();
      var fetches = 0;
      final sync = SyncCycle(
        runtime: runtime,
        logger: Logger(FakeClock(DateTime.utc(2026))),
        sendHeartbeat: () async => throw StateError('boom'),
        fetchPlan: () async {
          fetches++;
          return Err<FetchedPlan>(PlayerErrors.network('x'));
        },
        flushTelemetry: () async => 0,
      );

      expect(await sync.tick(), SyncResult.degraded);
      // Heartbeat failure suppresses the plan fetch this cycle.
      expect(fetches, 0);
      await runtime.dispose();
    });

    test('attempts a plan fetch when the server signals a change', () async {
      final runtime = RuntimeFactory.demo();
      var fetches = 0;
      final sync = SyncCycle(
        runtime: runtime,
        logger: Logger(FakeClock(DateTime.utc(2026))),
        sendHeartbeat: () async => _hb(planChanged: true),
        fetchPlan: () async {
          fetches++;
          return Err<FetchedPlan>(PlayerErrors.network('unreachable'));
        },
        flushTelemetry: () async => 0,
      );

      final result = await sync.tick();
      expect(fetches, 1);
      // A failed fetch never disturbs the active plan; the cycle degrades.
      expect(result, SyncResult.degraded);
      await runtime.dispose();
    });
  });
}
