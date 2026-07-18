/// Real telemetry transport (Sprint 10B).
///
/// Ships the [Outbox]'s queued events to `POST /v1/player/telemetry`
/// (device-authenticated) and reports which idempotency keys were durably
/// handled so the outbox can drop them. Ingestion is idempotent server-side
/// (dedup by `eventId`), so both `acceptedIds` and `duplicateIds` count as
/// durable — re-sending after an ambiguous network failure never double-counts.
///
/// Mapping [TelemetryEvent] → the contract's `PlayerPlaybackEvent` is a pure
/// function ([mapToPlaybackEvent]), as is response parsing
/// ([parseDurablyHandled]); only [send] performs IO.
///
/// Honesty: two prepared local lifecycle kinds (`planActivated`, `itemPrepared`)
/// have no counterpart in the telemetry contract's event vocabulary. They are
/// not ingestible operational events, so the transport treats them as locally
/// handled (removed from the outbox) rather than retrying them forever.
library;

import '../../core/ids/uuid.dart';
import '../../core/logging/logger.dart';
import '../telemetry/outbox.dart';
import 'player_http_client.dart';

/// Route (after the `v1` prefix) for telemetry ingestion.
const String kTelemetryRoute = 'player/telemetry';

final class HttpTelemetryTransport implements TelemetryTransport {
  HttpTelemetryTransport({
    required PlayerHttpClient http,
    required String appVersion,
    Logger? logger,
    String Function()? batchIdGenerator,
  }) : _http = http,
       _appVersion = appVersion,
       _logger = logger,
       _newBatchId = batchIdGenerator ?? randomUuidV4;

  final PlayerHttpClient _http;
  final String _appVersion;
  final Logger? _logger;
  final String Function() _newBatchId;

  @override
  Future<Set<String>> send(List<TelemetryEvent> batch) async {
    if (batch.isEmpty) return const {};

    // Partition into wire-ingestible playback events and local-only kinds.
    final playbackEvents = <Map<String, Object?>>[];
    final localOnly = <String>{};
    for (final e in batch) {
      final mapped = mapToPlaybackEvent(e, appVersion: _appVersion);
      if (mapped == null) {
        localOnly.add(e.idempotencyKey);
      } else {
        playbackEvents.add(mapped);
      }
    }

    if (playbackEvents.isEmpty) {
      // Nothing to ship; local-only kinds are considered handled.
      return localOnly;
    }

    final body = <String, Object?>{
      'batchId': _newBatchId(),
      'playbackEvents': playbackEvents,
      'errorEvents': const <Map<String, Object?>>[],
    };

    try {
      final res = await _http.postJson(
        kTelemetryRoute,
        body,
        authenticated: true,
      );
      final durable = parseDurablyHandled(res.json);
      final rejected = (res.json['rejectedIds'] as List?)?.length ?? 0;
      if (rejected > 0) {
        _logger?.warning(LogEvent.outboxFlushed, {'rejected': rejected});
      }
      // Local-only kinds never travelled but should not linger in the queue.
      return {...durable, ...localOnly};
    } on PlayerHttpException catch (e) {
      // Leave events queued; the outbox retries with backoff on the next cycle.
      _logger?.warning(LogEvent.outboxFlushed, {
        'error': e.isNetwork ? 'network' : 'http_${e.statusCode}',
      });
      return const {};
    }
  }
}

/// Maps one [TelemetryEvent] to a contract `PlayerPlaybackEvent`, or `null` when
/// the kind has no ingestible telemetry counterpart. Reads well-known keys from
/// [TelemetryEvent.fields]; absent keys map to nulls/defaults.
Map<String, Object?>? mapToPlaybackEvent(
  TelemetryEvent e, {
  required String appVersion,
}) {
  final type = _playbackEventType(e.kind);
  if (type == null) return null;
  final f = e.fields;
  return <String, Object?>{
    'schemaVersion': 1,
    'eventId': e.idempotencyKey,
    'type': type,
    'planVersion': f['planVersion'],
    'effectivePlanHash': f['effectivePlanHash'],
    'itemId': f['itemId'],
    'assetId': f['assetId'],
    'startedAt': (f['startedAt'] as String?) ?? e.createdAt.toIso8601String(),
    'endedAt': f['endedAt'],
    'positionMs': f['positionMs'],
    'durationMs': f['durationMs'],
    'completionPct': f['completionPct'],
    'source': (f['source'] as String?) ?? 'runtime',
    'reason': f['reason'],
    'appVersion': appVersion,
  };
}

String? _playbackEventType(TelemetryKind kind) => switch (kind) {
  TelemetryKind.playbackStarted => 'playback_started',
  TelemetryKind.playbackProgress => 'playback_progress_checkpoint',
  TelemetryKind.playbackCompleted => 'playback_completed',
  TelemetryKind.playbackSkipped => 'playback_skipped',
  TelemetryKind.playbackInterrupted => 'playback_skipped',
  TelemetryKind.playbackFailed => 'playback_failed',
  TelemetryKind.emergencyPlayback => 'emergency_started',
  // Local lifecycle markers with no contract event type.
  TelemetryKind.planActivated => null,
  TelemetryKind.itemPrepared => null,
};

/// Parses `acceptedIds ∪ duplicateIds` — the set of event ids the server has
/// durably recorded (both mean "do not send again").
Set<String> parseDurablyHandled(Map<String, Object?> json) {
  final accepted = (json['acceptedIds'] as List?)?.cast<Object?>() ?? const [];
  final duplicate =
      (json['duplicateIds'] as List?)?.cast<Object?>() ?? const [];
  return {...accepted.whereType<String>(), ...duplicate.whereType<String>()};
}
