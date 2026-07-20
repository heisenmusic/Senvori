import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/features/net/execution_plan_gateway.dart';
import 'package:senvori_player/features/plan_runtime/plan.dart';

Map<String, Object?> _response() => {
  'contractVersion': '1.0.0',
  'unitId': 'unit-1',
  'timezone': 'America/Sao_Paulo',
  'localDate': '2026-07-18',
  'windowStartUtc': null,
  'windowEndUtc': null,
  'compilerVersion': '2.0.0',
  'basePlanHash': 'base-hash',
  'effectivePlanHash': 'eff-hash',
  'emergencyActive': false,
  'fallbackActive': false,
  'reasonCode': 'assignment_resolved',
  'items': [
    {
      'position': 0,
      'assetId': 'asset-a',
      'title': 'Track A',
      'artist': 'Artist A',
      'startOffsetMs': 0,
      'durationMs': 180000,
      'source': 'program-x',
      'reason': 'assignment_resolved',
    },
    {
      'position': 1,
      'assetId': 'asset-b',
      'title': 'Track B',
      'artist': null,
      'startOffsetMs': 180000,
      'durationMs': 120000,
      'source': 'program-x',
      'reason': 'assignment_resolved',
    },
  ],
  'overlays': [
    {
      'kind': 'interrupt',
      'assetId': 'asset-emg',
      'startOffsetMs': 60000,
      'durationMs': 30000,
      'duckingDb': -12,
      'sourceReference': 'evt-emergency-1',
      'reasonCode': 'emergency_broadcast',
    },
  ],
  'assets': [
    {
      'assetId': 'asset-a',
      'url': 'https://cdn.test/a?sig=1',
      'checksumSha256': 'a' * 64,
      'sizeBytes': 1000,
      'contentType': 'audio/mpeg',
      'durationMs': 180000,
      'title': 'Track A',
      'artist': 'Artist A',
    },
    {
      'assetId': 'asset-emg',
      'url': 'https://cdn.test/emg?sig=2',
      'checksumSha256': null,
      'sizeBytes': null,
      'contentType': 'audio/mpeg',
      'durationMs': 30000,
      'title': 'Emergency',
      'artist': null,
    },
  ],
  'generatedAt': '2026-07-18T09:00:00.000Z',
  'expiresAt': '2026-07-18T10:00:00.000Z',
};

void main() {
  group('mapExecutionPlanResponse', () {
    test('maps items, overlays and assets into a domain plan', () {
      final result = mapExecutionPlanResponse(_response());
      expect(result.isOk, isTrue);
      final fetched = result.value;
      final plan = fetched.plan;

      expect(plan.unitId, 'unit-1');
      expect(plan.effectivePlanHash, 'eff-hash');
      expect(plan.basePlanHash, 'base-hash');
      expect(plan.timezone, 'America/Sao_Paulo');
      expect(plan.validUntil, DateTime.utc(2026, 7, 18, 10));

      // 2 tracks + 1 overlay, ordered by startOffset (0, 60000, 180000).
      expect(plan.items.length, 3);
      expect(plan.items[0].assetId, 'asset-a');
      expect(plan.items[1].assetId, 'asset-emg');
      expect(plan.items[2].assetId, 'asset-b');
    });

    test('infers emergency from overlay reasonCode', () {
      final plan = mapExecutionPlanResponse(_response()).value.plan;
      expect(plan.emergencyActive, isTrue);
      expect(
        plan.items.firstWhere((i) => i.assetId == 'asset-emg').type,
        PlanItemType.emergency,
      );
    });

    test('collects signed URLs and checksums keyed by assetId', () {
      final fetched = mapExecutionPlanResponse(_response()).value;
      expect(fetched.sourceUris['asset-a'], 'https://cdn.test/a?sig=1');
      expect(fetched.sourceUris['asset-emg'], 'https://cdn.test/emg?sig=2');
      expect(fetched.checksums['asset-a'], 'a' * 64);
      expect(fetched.checksums['asset-emg'], isNull);
    });

    test('referencedAssetIds reflects mapped items', () {
      final plan = mapExecutionPlanResponse(_response()).value.plan;
      expect(
        plan.referencedAssetIds,
        containsAll(['asset-a', 'asset-b', 'asset-emg']),
      );
    });

    test('rejects a response missing required fields', () {
      final bad = _response()..remove('effectivePlanHash');
      final result = mapExecutionPlanResponse(bad);
      expect(result.isErr, isTrue);
      expect(result.errorOrNull!.code, 'plan.invalid');
    });
  });
}
