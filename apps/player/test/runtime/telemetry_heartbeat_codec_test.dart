import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/core/ids/uuid.dart';
import 'package:senvori_player/features/net/heartbeat_client.dart';
import 'package:senvori_player/features/net/http_telemetry_transport.dart';
import 'package:senvori_player/features/telemetry/outbox.dart';

void main() {
  group('mapToPlaybackEvent', () {
    TelemetryEvent event(TelemetryKind kind, {Map<String, Object?>? fields}) =>
        TelemetryEvent(
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          kind: kind,
          createdAt: DateTime.utc(2026, 7, 18, 9),
          fields: fields ?? const {},
        );

    test('maps a playback started event with fields', () {
      final wire = mapToPlaybackEvent(
        event(
          TelemetryKind.playbackStarted,
          fields: {
            'itemId': 'item-1',
            'assetId': 'asset-1',
            'source': 'program-x',
            'positionMs': 0,
          },
        ),
        appVersion: '1.0.0',
      );
      expect(wire, isNotNull);
      expect(wire!['type'], 'playback_started');
      expect(wire['eventId'], '11111111-1111-4111-8111-111111111111');
      expect(wire['itemId'], 'item-1');
      expect(wire['assetId'], 'asset-1');
      expect(wire['source'], 'program-x');
      expect(wire['appVersion'], '1.0.0');
    });

    test('falls back to createdAt and default source', () {
      final wire = mapToPlaybackEvent(
        event(TelemetryKind.playbackCompleted),
        appVersion: '2.0.0',
      )!;
      expect(wire['startedAt'], '2026-07-18T09:00:00.000Z');
      expect(wire['source'], 'runtime');
      expect(wire['type'], 'playback_completed');
    });

    test('interrupted maps to skipped', () {
      final wire = mapToPlaybackEvent(
        event(TelemetryKind.playbackInterrupted),
        appVersion: '1.0.0',
      )!;
      expect(wire['type'], 'playback_skipped');
    });

    test('emergency maps to emergency_started', () {
      final wire = mapToPlaybackEvent(
        event(TelemetryKind.emergencyPlayback),
        appVersion: '1.0.0',
      )!;
      expect(wire['type'], 'emergency_started');
    });

    test('local-only lifecycle kinds map to null (not ingestible)', () {
      expect(
        mapToPlaybackEvent(event(TelemetryKind.planActivated),
            appVersion: '1.0.0'),
        isNull,
      );
      expect(
        mapToPlaybackEvent(event(TelemetryKind.itemPrepared),
            appVersion: '1.0.0'),
        isNull,
      );
    });
  });

  group('parseDurablyHandled', () {
    test('unions accepted and duplicate ids', () {
      final durable = parseDurablyHandled({
        'acceptedIds': ['a', 'b'],
        'duplicateIds': ['b', 'c'],
        'rejectedIds': ['d'],
      });
      expect(durable, {'a', 'b', 'c'});
      expect(durable.contains('d'), isFalse);
    });

    test('tolerates missing arrays', () {
      expect(parseDurablyHandled(const {}), isEmpty);
    });
  });

  group('heartbeat codec', () {
    test('builds a runtime status body with contract version', () {
      final body = buildHeartbeatRequest(
        appVersion: '1.0.0',
        platform: 'android',
        runtimeState: 'playing',
        connectivity: 'apiReachable',
        reportedAt: DateTime.utc(2026, 7, 18, 9, 30),
        assetCount: 12,
        outboxSize: 3,
        effectivePlanHash: 'eff-hash',
        currentItemId: 'item-1',
        positionMs: 42000,
      );
      expect(body['contractVersion'], '1.0.0');
      expect(body['runtimeState'], 'playing');
      expect(body['reportedAt'], '2026-07-18T09:30:00.000Z');
      expect(body['assetCount'], 12);
      expect(body['currentItemId'], 'item-1');
    });

    test('parses a heartbeat response with planChanged', () {
      final result = parseHeartbeatResponse({
        'serverTime': '2026-07-18T09:30:05.000Z',
        'effectivePlanHash': 'new-hash',
        'planChanged': true,
        'nextHeartbeatSeconds': 30,
      });
      expect(result.planChanged, isTrue);
      expect(result.effectivePlanHash, 'new-hash');
      expect(result.nextHeartbeatSeconds, 30);
      expect(result.serverTime, DateTime.utc(2026, 7, 18, 9, 30, 5));
    });
  });

  group('randomUuidV4', () {
    test('produces a valid v4 uuid', () {
      final id = randomUuidV4();
      expect(isUuid(id), isTrue);
      expect(id[14], '4'); // version nibble
      expect('89ab'.contains(id[19]), isTrue); // variant nibble
    });
  });
}
