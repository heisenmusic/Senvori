import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/core/logging/logger.dart';
import 'package:senvori_player/core/persistence/key_value_store.dart';
import 'package:senvori_player/core/time/clock.dart';
import 'package:senvori_player/features/plan_runtime/plan.dart';
import 'package:senvori_player/features/plan_runtime/plan_mapper.dart';
import 'package:senvori_player/features/plan_runtime/plan_store.dart';
import 'package:senvori_player/features/plan_runtime/plan_validator.dart';

PlanItem _item(
  String id, {
  Duration off = Duration.zero,
  Duration dur = const Duration(minutes: 3),
}) => PlanItem(
  id: id,
  type: PlanItemType.track,
  assetId: 'asset-$id',
  title: id,
  startOffset: off,
  duration: dur,
  sourceReference: 'p',
  reasonCode: 'schedule_match',
);

PlayerPlan _plan({
  String hash = 'eff1',
  List<PlanItem>? items,
  bool emergency = false,
}) => PlayerPlan(
  unitId: 'unit-1',
  localDate: '2026-07-17',
  timezone: 'America/Sao_Paulo',
  basePlanHash: 'base1',
  effectivePlanHash: hash,
  emergencyActive: emergency,
  reasonCode: 'schedule_match',
  items: items ?? [_item('t1'), _item('t2', off: const Duration(minutes: 3))],
);

void main() {
  group('PlanValidator', () {
    const v = PlanValidator();

    test('accepts a well-formed plan', () {
      expect(v.validate(_plan()).isOk, isTrue);
    });

    test('rejects empty effectivePlanHash', () {
      expect(v.validate(_plan(hash: '')).isErr, isTrue);
    });

    test('rejects duplicate item ids', () {
      final p = _plan(
        items: [
          _item('dup'),
          _item('dup', off: const Duration(minutes: 3)),
        ],
      );
      expect(v.validate(p).errorOrNull?.code, 'plan.invalid');
    });

    test('rejects out-of-order items', () {
      final p = _plan(
        items: [
          _item('a', off: const Duration(minutes: 5)),
          _item('b'),
        ],
      );
      expect(v.validate(p).isErr, isTrue);
    });

    test('rejects emergencyActive with no emergency item', () {
      expect(v.validate(_plan(emergency: true)).isErr, isTrue);
    });

    test('rejects bad localDate', () {
      final p = PlayerPlan(
        unitId: 'u',
        localDate: '17-07-2026',
        timezone: 'x',
        basePlanHash: null,
        effectivePlanHash: 'e',
        emergencyActive: false,
        reasonCode: 'r',
        items: const [],
      );
      expect(v.validate(p).isErr, isTrue);
    });
  });

  group('PlanMapper', () {
    test(
      'maps wire effective-plan + program items into an ordered domain plan',
      () {
        final wire = {
          'unitId': 'unit-1',
          'localDate': '2026-07-17',
          'timezone': 'America/Sao_Paulo',
          'basePlanHash': 'base1',
          'effectivePlanHash': 'eff1',
          'emergencyActive': false,
          'resolution': {
            'reasonCode': 'schedule_match',
            'selectedProgramId': 'prog-1',
          },
          'overlays': [
            {
              'kind': 'insert',
              'assetId': 'ad-1',
              'startOffsetMs': 60000,
              'durationMs': 15000,
              'sourceReference': 'evt-1',
              'reasonCode': 'campaign_slot',
            },
          ],
          'warnings': [],
        };
        final items = [
          {'id': 'i1', 'assetId': 'a1', 'title': 'One', 'durationMs': 120000},
          {'id': 'i2', 'assetId': 'a2', 'title': 'Two', 'durationMs': 120000},
        ];
        final res = PlanMapper.fromWire(
          effectivePlan: wire,
          programItems: items,
        );
        expect(res.isOk, isTrue);
        final plan = res.value;
        expect(plan.items.length, 3);
        // Ordered by startOffset: i1(0), insert(60s), i2(120s).
        expect(plan.items[0].id, 'i1');
        expect(plan.items[1].type, PlanItemType.insert);
        expect(plan.items[2].id, 'i2');
      },
    );

    test('detects emergency overlay and sets emergencyActive', () {
      final wire = {
        'unitId': 'u',
        'localDate': '2026-07-17',
        'timezone': 'tz',
        'effectivePlanHash': 'e',
        'emergencyActive': false,
        'resolution': {'reasonCode': 'r'},
        'overlays': [
          {
            'kind': 'interrupt',
            'assetId': 'emg',
            'startOffsetMs': 0,
            'durationMs': 30000,
            'sourceReference': 's',
            'reasonCode': 'emergency_broadcast',
          },
        ],
      };
      final res = PlanMapper.fromWire(
        effectivePlan: wire,
        programItems: const [],
      );
      expect(res.value.emergencyActive, isTrue);
      expect(res.value.emergencyItems.length, 1);
    });

    test('rejects wire missing required fields', () {
      final res = PlanMapper.fromWire(
        effectivePlan: const {'unitId': 'u'},
        programItems: const [],
      );
      expect(res.isErr, isTrue);
    });
  });

  group('PlanStore', () {
    late InMemoryKeyValueStore backend;
    late DocumentStore store;
    late Logger logger;

    setUp(() {
      backend = InMemoryKeyValueStore();
      store = DocumentStore(backend);
      logger = Logger(FakeClock(DateTime.utc(2026, 7, 17)));
    });

    test('receive stages a valid plan as pending without touching active', () {
      final ps = PlanStore(store: store, logger: logger);
      expect(ps.receive(_plan()).isOk, isTrue);
      expect(ps.pending, isNotNull);
      expect(ps.active, isNull);
    });

    test('invalid plan is rejected and never staged', () {
      final ps = PlanStore(store: store, logger: logger);
      expect(ps.receive(_plan(hash: '')).isErr, isTrue);
      expect(ps.pending, isNull);
    });

    test(
      'activatePending promotes to active + lastKnownGood and persists',
      () async {
        final ps = PlanStore(store: store, logger: logger);
        ps.receive(_plan(hash: 'effX'));
        final res = await ps.activatePending('effX');
        expect(res.isOk, isTrue);
        expect(ps.active?.effectivePlanHash, 'effX');
        expect(ps.lastKnownGood?.effectivePlanHash, 'effX');
        // Persisted.
        expect(await backend.readRaw('last_known_good_plan'), isNotNull);
      },
    );

    test(
      'offline restart: a new store instance restores the persisted plan and boots active',
      () async {
        final ps1 = PlanStore(store: store, logger: logger);
        ps1.receive(_plan(hash: 'persisted'));
        await ps1.activatePending('persisted');

        // Simulate app restart: brand new store over the SAME backend.
        final ps2 = PlanStore(store: DocumentStore(backend), logger: logger);
        final restored = await ps2.restore();
        expect(restored.isOk, isTrue);
        expect(ps2.active?.effectivePlanHash, 'persisted');
        expect(ps2.lastKnownGood?.effectivePlanHash, 'persisted');
      },
    );

    test(
      'corrupted persisted state is surfaced, not thrown, and leaves slots empty',
      () async {
        backend.seedRaw('last_known_good_plan', '{not json');
        final ps = PlanStore(store: store, logger: logger);
        final res = await ps.restore();
        expect(res.isErr, isTrue);
        expect(ps.active, isNull);
      },
    );

    test(
      'a failed sync (bad pending) never destroys the active plan',
      () async {
        final ps = PlanStore(store: store, logger: logger);
        ps.receive(_plan(hash: 'good'));
        await ps.activatePending('good');
        // Receive an invalid plan.
        expect(ps.receive(_plan(hash: '')).isErr, isTrue);
        expect(ps.active?.effectivePlanHash, 'good');
      },
    );
  });
}
