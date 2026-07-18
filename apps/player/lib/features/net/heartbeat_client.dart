/// Heartbeat / runtime-status client (Sprint 10B).
///
/// Posts the Player's self-reported operational status to
/// `POST /v1/player/heartbeat` (device-authenticated) and returns the server's
/// response, whose `planChanged` flag is the primary signal that drives a plan
/// re-fetch in the sync cycle. Carries only operational data — never tokens,
/// filesystem paths or stack traces (contract §4.8): `lastError` is a short
/// sanitized code.
///
/// [buildHeartbeatRequest] is a pure codec (unit-testable); [send] does IO.
library;

import 'player_backend_config.dart';
import 'player_http_client.dart';

/// Route (after the `v1` prefix) for heartbeat.
const String kHeartbeatRoute = 'player/heartbeat';

/// The server's heartbeat acknowledgement.
final class HeartbeatResult {
  const HeartbeatResult({
    required this.planChanged,
    required this.nextHeartbeatSeconds,
    this.effectivePlanHash,
    this.serverTime,
  });

  final bool planChanged;
  final int nextHeartbeatSeconds;
  final String? effectivePlanHash;
  final DateTime? serverTime;
}

/// Builds a `PlayerRuntimeStatus` request body. Enum-valued fields
/// ([runtimeState], [connectivity]) are passed as their already-mapped contract
/// string vocabulary so this stays a decoupled, testable codec.
Map<String, Object?> buildHeartbeatRequest({
  required String appVersion,
  required String platform,
  required String runtimeState,
  required String connectivity,
  required DateTime reportedAt,
  required int assetCount,
  required int outboxSize,
  String? activePlanHash,
  String? effectivePlanHash,
  String? currentItemId,
  int? positionMs,
  Map<String, Object?>? storage,
  DateTime? lastSyncAt,
  String? lastError,
}) => <String, Object?>{
  'schemaVersion': 1,
  'appVersion': appVersion,
  'contractVersion': kPlayerContractVersion,
  'platform': platform,
  'runtimeState': runtimeState,
  'connectivity': connectivity,
  'activePlanHash': activePlanHash,
  'effectivePlanHash': effectivePlanHash,
  'currentItemId': currentItemId,
  'positionMs': positionMs,
  'storage': storage,
  'assetCount': assetCount,
  'outboxSize': outboxSize,
  'lastSyncAt': lastSyncAt?.toIso8601String(),
  'lastError': lastError,
  'reportedAt': reportedAt.toIso8601String(),
};

/// Parses a `PlayerHeartbeatResponse`.
HeartbeatResult parseHeartbeatResponse(Map<String, Object?> json) =>
    HeartbeatResult(
      planChanged: json['planChanged'] as bool? ?? false,
      nextHeartbeatSeconds:
          (json['nextHeartbeatSeconds'] as num?)?.toInt() ?? 60,
      effectivePlanHash: json['effectivePlanHash'] as String?,
      serverTime: json['serverTime'] is String
          ? DateTime.tryParse(json['serverTime'] as String)
          : null,
    );

final class HeartbeatClient {
  HeartbeatClient(this._http);
  final PlayerHttpClient _http;

  /// Sends one heartbeat. Throws [PlayerHttpException] on transport/auth failure
  /// so the sync cycle can classify and back off.
  Future<HeartbeatResult> send(Map<String, Object?> status) async {
    final res = await _http.postJson(
      kHeartbeatRoute,
      status,
      authenticated: true,
    );
    return parseHeartbeatResponse(res.json);
  }
}
