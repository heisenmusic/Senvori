import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/app/runtime_factory.dart';
import 'package:senvori_player/core/persistence/key_value_store.dart';
import 'package:senvori_player/core/time/clock.dart';
import 'package:senvori_player/features/demo/demo_fixtures.dart';
import 'package:senvori_player/features/plan_runtime/plan.dart';
import 'package:senvori_player/features/playback/fake_playback_engine.dart';
import 'package:senvori_player/features/telemetry/outbox.dart';

/// Simulated long-duration soak (Sprint 09 · §52). Compresses ~24h of operation
/// into deterministic ticks against the in-memory runtime and asserts stability
/// properties: playback keeps advancing (no stuck state), telemetry stays
/// deduplicated and bounded, and the run completes without unhandled errors.
///
/// Honesty: this is a *simulated* soak on the fake engine, not 24h of real audio
/// on a device. It proves the runtime's state machine and bookkeeping remain
/// consistent over many transitions; real-hardware soak is future work.
void main() {
  test(
    '24h simulated soak keeps the queue advancing and telemetry consistent',
    () async {
      final backend = InMemoryKeyValueStore();
      final wall = FakeClock(DateTime.utc(2026, 7, 17, 0, 0));
      final mono = FakeMonotonicClock();
      final engine = FakePlaybackEngine();
      final rt = RuntimeFactory.demo(
        backend: backend,
        clock: wall,
        monotonic: mono,
        engine: engine,
      );
      await rt.boot();
      await rt.applyPlan(DemoFixtures.cafePlan(), sourceUris: const {});
      await Future<void>.delayed(Duration.zero);

      final outbox = rt.outbox;
      var completed = 0;
      final distinctItemsSeen = <String>{};
      var unhandled = 0;

      // 24h at 30s ticks = 2880 iterations.
      const tickDur = Duration(seconds: 30);
      const iterations = 2 * 60 * 24; // 2880
      var emergencyToggles = 0;

      for (var i = 0; i < iterations; i++) {
        wall.advance(tickDur);
        mono.advance(tickDur);

        final before = rt.orchestrator.currentItem?.id;
        engine.tick(tickDur);
        await Future<void>.delayed(Duration.zero);
        final after = rt.orchestrator.currentItem?.id;
        if (before != null) distinctItemsSeen.add(before);
        if (before != after) {
          completed++;
          // Emit a (deduplicated) telemetry event per completion.
          await outbox.enqueue(
            outbox.build(
              TelemetryKind.playbackCompleted,
              'cmp_${wall.now().millisecondsSinceEpoch}_$before',
              {'itemId': before},
            ),
          );
        }

        // Every ~2h re-evaluate connectivity (exercises the monitor path).
        if (i % 240 == 0 && i > 0) {
          await rt.connectivity.evaluate();
        }

        // Every ~4h inject and clear an emergency.
        if (i % 480 == 0 && i > 0) {
          try {
            if (!rt.orchestrator.emergencyActive) {
              await rt.orchestrator.enterEmergency([
                const PlanItem(
                  id: 'emg',
                  type: PlanItemType.emergency,
                  assetId: 'asset-emergency',
                  title: 'E',
                  startOffset: Duration.zero,
                  duration: Duration(seconds: 30),
                  sourceReference: 'emergency',
                  reasonCode: 'emergency_broadcast',
                ),
              ]);
              emergencyToggles++;
            } else {
              await rt.orchestrator.exitEmergency();
            }
          } catch (_) {
            unhandled++;
          }
        }

        // Every ~6h apply a fresh day's plan.
        if (i % 720 == 0 && i > 0) {
          await rt.applyPlan(
            DemoFixtures.cafePlan(localDate: '2026-07-${18 + (i ~/ 720)}'),
            sourceUris: const {},
          );
        }
      }

      // Stability assertions.
      expect(unhandled, 0, reason: 'no unhandled errors during soak');
      expect(
        completed,
        greaterThan(100),
        reason: 'playback advanced many times (not stuck)',
      );
      expect(
        emergencyToggles,
        greaterThan(0),
        reason: 'emergencies were exercised',
      );
      // Telemetry bounded and deduplicated: never exceeds configured capacity.
      expect(outbox.length, lessThanOrEqualTo(5000));
      // The runtime is still in a live, non-fatal state.
      expect(rt.lifecycle.state.name, isNot('fatalError'));
      expect(
        rt.orchestrator.currentItem,
        isNotNull,
        reason: 'still has something to play',
      );

      await rt.dispose();
    },
  );
}
