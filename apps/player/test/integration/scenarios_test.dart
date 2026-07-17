import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/app/player_lifecycle.dart';
import 'package:senvori_player/app/runtime_factory.dart';
import 'package:senvori_player/core/persistence/key_value_store.dart';
import 'package:senvori_player/features/connectivity/connectivity.dart';
import 'package:senvori_player/features/demo/demo_fixtures.dart';
import 'package:senvori_player/features/plan_runtime/plan.dart';
import 'package:senvori_player/features/playback/fake_playback_engine.dart';

/// End-to-end runtime scenarios (Sprint 09 · §51). These drive the full
/// composition root (minus real IO/audio) through the sprint's required
/// scenarios using the deterministic in-memory runtime.
void main() {
  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test(
    'Scenario 1 — first use: boot, receive plan, become ready and playing',
    () async {
      final engine = FakePlaybackEngine();
      final rt = RuntimeFactory.demo(engine: engine);
      await rt.boot();
      final applied = await rt.applyPlan(
        DemoFixtures.cafePlan(),
        sourceUris: const {},
      );
      await settle();
      expect(applied, isTrue);
      expect(rt.lifecycle.state, PlayerLifecycleState.playing);
      expect(rt.orchestrator.currentItem, isNotNull);
      await rt.dispose();
    },
  );

  test(
    'Scenario 2 — offline restart: plan persists and reloads from disk offline',
    () async {
      final backend = InMemoryKeyValueStore();

      // First session: online, receive and activate a plan.
      final rt1 = RuntimeFactory.demo(
        backend: backend,
        connectivity: ConnectivityState.apiReachable,
      );
      await rt1.boot();
      await rt1.applyPlan(
        DemoFixtures.cafePlan(localDate: '2026-07-17'),
        sourceUris: const {},
      );
      await rt1.dispose();

      // Second session over the SAME backend, now OFFLINE (app restarted, no net).
      final rt2 = RuntimeFactory.demo(
        backend: backend,
        connectivity: ConnectivityState.offline,
      );
      await rt2.boot();
      await settle();
      expect(rt2.planStore.active?.localDate, '2026-07-17');
      expect(rt2.lifecycle.state, PlayerLifecycleState.offlineOperational);
      expect(
        rt2.orchestrator.currentItem,
        isNotNull,
      ); // continues from local plan
      await rt2.dispose();
    },
  );

  test(
    'Scenario 3 — new plan staged while current keeps playing until activation',
    () async {
      final rt = RuntimeFactory.demo();
      await rt.boot();
      await rt.applyPlan(
        DemoFixtures.cafePlan(localDate: '2026-07-17'),
        sourceUris: const {},
      );
      final firstHash = rt.planStore.active!.effectivePlanHash;

      // A new plan arrives but its assets are declared not-yet-ready.
      final newPlan = DemoFixtures.cafePlan(localDate: '2026-07-18');
      final activated = await rt.applyPlan(
        newPlan,
        sourceUris: {
          for (final a in newPlan.referencedAssetIds) a: 'https://x/$a',
        },
        requireAllAssetsReady: true,
      );
      await settle();
      // Not activated yet; the current plan still runs.
      expect(activated, isFalse);
      expect(rt.planStore.active!.effectivePlanHash, firstHash);
      expect(rt.planStore.pending, isNotNull);
      await rt.dispose();
    },
  );

  test(
    'Scenario 6 — emergency: base interrupted, emergency assumes, then base resumes',
    () async {
      final engine = FakePlaybackEngine();
      final rt = RuntimeFactory.demo(engine: engine);
      await rt.boot();
      await rt.applyPlan(DemoFixtures.cafePlan(), sourceUris: const {});
      await settle();
      final baseItem = rt.orchestrator.currentItem;
      expect(rt.orchestrator.emergencyActive, isFalse);

      // Emergency arrives.
      await rt.orchestrator.enterEmergency([
        const PlanItem(
          id: 'emg',
          type: PlanItemType.emergency,
          assetId: 'asset-emergency',
          title: 'Emergency',
          startOffset: Duration.zero,
          duration: Duration(seconds: 5),
          sourceReference: 'emergency',
          reasonCode: 'emergency_broadcast',
        ),
      ]);
      await settle();
      expect(rt.orchestrator.emergencyActive, isTrue);
      expect(rt.orchestrator.currentItem?.id, 'emg');

      await rt.orchestrator.exitEmergency();
      await settle();
      expect(rt.orchestrator.emergencyActive, isFalse);
      expect(rt.orchestrator.currentItem?.id, baseItem?.id);
      await rt.dispose();
    },
  );
}
