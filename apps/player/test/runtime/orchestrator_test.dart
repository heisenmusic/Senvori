import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/core/logging/logger.dart';
import 'package:senvori_player/core/time/clock.dart';
import 'package:senvori_player/features/plan_runtime/plan.dart';
import 'package:senvori_player/features/playback/fake_playback_engine.dart';
import 'package:senvori_player/features/playback/playback_engine.dart';
import 'package:senvori_player/features/playback/playback_orchestrator.dart';
import 'package:senvori_player/features/queue/execution_queue.dart';

PlanItem _t(
  String id, {
  Duration off = Duration.zero,
  Duration dur = const Duration(seconds: 2),
}) => PlanItem(
  id: id,
  type: PlanItemType.track,
  assetId: 'asset-$id',
  title: id,
  startOffset: off,
  duration: dur,
  sourceReference: 'p',
  reasonCode: 'r',
);

PlanItem _emg(String id) => PlanItem(
  id: id,
  type: PlanItemType.emergency,
  assetId: 'emg-$id',
  title: 'EMG',
  startOffset: Duration.zero,
  duration: const Duration(seconds: 2),
  sourceReference: 'emergency',
  reasonCode: 'emergency_broadcast',
);

PlayerPlan _plan(List<PlanItem> items, {bool emergency = false}) => PlayerPlan(
  unitId: 'u',
  localDate: '2026-07-17',
  timezone: 'tz',
  basePlanHash: 'b',
  effectivePlanHash: 'e',
  emergencyActive: emergency,
  reasonCode: 'r',
  items: items,
);

PlaybackOrchestrator _orch(FakePlaybackEngine engine, {Set<String>? ready}) =>
    PlaybackOrchestrator(
      engine: engine,
      logger: Logger(FakeClock(DateTime.utc(2026))),
      monotonic: FakeMonotonicClock(),
      resolveLocalPath: (assetId) =>
          (ready == null || ready.contains(assetId)) ? '/local/$assetId' : null,
    );

Future<void> _settle() => Future<void>.delayed(Duration.zero);

void main() {
  group('ExecutionQueue', () {
    test('advances and rotates over non-emergency items', () {
      final q = ExecutionQueue(
        _plan([_t('a'), _t('b', off: const Duration(seconds: 2))]),
      );
      expect(q.current?.id, 'a');
      expect(q.peekNext()?.id, 'b');
      expect(q.advance()?.id, 'b');
      expect(q.advance()?.id, 'a'); // rotates back
    });

    test('excludes emergency items from the base queue', () {
      final q = ExecutionQueue(_plan([_t('a'), _emg('x')]));
      expect(q.length, 1);
    });
  });

  group('PlaybackOrchestrator', () {
    test('plays the first item then advances on completion', () async {
      final engine = FakePlaybackEngine();
      final orch = _orch(engine);
      await orch.loadPlan(
        _plan([_t('a'), _t('b', off: const Duration(seconds: 2))]),
      );
      await _settle();
      expect(orch.currentItem?.id, 'a');
      expect(engine.snapshot.status, PlaybackStatus.playing);

      // Complete item a.
      engine.tick(const Duration(seconds: 2));
      await _settle();
      expect(orch.currentItem?.id, 'b');
      await orch.dispose();
    });

    test(
      'retries a failing item up to the bound, then skips and continues',
      () async {
        // Item a always fails to prepare; b is fine.
        final engine = FakePlaybackEngine(failItemIds: {'a'});
        final orch = _orch(engine);
        await orch.loadPlan(
          _plan([_t('a'), _t('b', off: const Duration(seconds: 2))]),
        );
        await _settle();
        // After exhausting retries on 'a', orchestrator moves on to 'b'.
        expect(engine.prepareCounts['a'], greaterThanOrEqualTo(2));
        expect(orch.currentItem?.id, 'b');
        await orch.dispose();
      },
    );

    test('skips forward when the asset is not ready (not stalled)', () async {
      final engine = FakePlaybackEngine();
      // Only b resolves to a local path.
      final orch = _orch(engine, ready: {'asset-b'});
      await orch.loadPlan(
        _plan([_t('a'), _t('b', off: const Duration(seconds: 2))]),
      );
      await _settle();
      expect(orch.currentItem?.id, 'b');
      await orch.dispose();
    });

    test('emergency in the plan takes priority immediately', () async {
      final engine = FakePlaybackEngine();
      final orch = _orch(engine);
      await orch.loadPlan(_plan([_t('a'), _emg('x')], emergency: true));
      await _settle();
      expect(orch.emergencyActive, isTrue);
      expect(orch.currentItem?.id, 'x');
      await orch.dispose();
    });

    test('enter/exit emergency interrupts base and then restores it', () async {
      final engine = FakePlaybackEngine();
      final orch = _orch(engine);
      await orch.loadPlan(
        _plan([_t('a'), _t('b', off: const Duration(seconds: 2))]),
      );
      await _settle();
      expect(orch.currentItem?.id, 'a');

      await orch.enterEmergency([_emg('siren')]);
      await _settle();
      expect(orch.emergencyActive, isTrue);
      expect(orch.currentItem?.id, 'siren');

      await orch.exitEmergency();
      await _settle();
      expect(orch.emergencyActive, isFalse);
      // Base resumes at its current queue item (a was interrupted, still current).
      expect(orch.currentItem?.id, 'a');
      await orch.dispose();
    });
  });
}
