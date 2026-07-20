/// Effective execution plan gateway (Sprint 10B).
///
/// Fetches `GET /v1/player/execution-plan` (device-authenticated) and maps the
/// `PlayerExecutionPlanResponse` wire shape into the Player's domain [PlayerPlan]
/// plus the per-asset signed download URLs and SHA-256 checksums the asset cache
/// needs. The mapping is a pure function ([mapExecutionPlanResponse]) so it is
/// exhaustively unit-testable without a socket; only [fetch] touches IO.
///
/// This maps the *real* contract shape directly — distinct from the Sprint 09
/// `PlanMapper.fromWire`, which consumed an earlier two-part (effective-plan +
/// separate program-items) shape. Both are kept; the runtime uses whichever
/// gateway produced the data.
library;

import '../../core/errors/player_error.dart';
import '../../core/result/result.dart';
import '../plan_runtime/plan.dart';
import 'player_http_client.dart';

/// A plan plus the resources required to make it playable.
final class FetchedPlan {
  const FetchedPlan({
    required this.plan,
    required this.sourceUris,
    required this.checksums,
    this.expiresAt,
  });

  final PlayerPlan plan;

  /// assetId → signed download URL.
  final Map<String, String> sourceUris;

  /// assetId → expected SHA-256 hex (nullable when the backend omits it).
  final Map<String, String?> checksums;

  /// Signed-plan validity boundary; the runtime should re-fetch past this.
  final DateTime? expiresAt;
}

/// Route (after the `v1` prefix) for the effective execution plan.
const String kExecutionPlanRoute = 'player/execution-plan';

final class ExecutionPlanGateway {
  ExecutionPlanGateway(this._http);
  final PlayerHttpClient _http;

  /// Fetches and maps the effective plan. Network/auth failures surface as an
  /// [Err]; the caller (sync cycle) decides retry vs. degrade.
  Future<Result<FetchedPlan>> fetch() async {
    try {
      final res = await _http.getJson(kExecutionPlanRoute, authenticated: true);
      return mapExecutionPlanResponse(res.json);
    } on PlayerHttpException catch (e) {
      if (e.isUnauthorized) {
        return Err(PlayerErrors.unauthorized(status: e.statusCode));
      }
      if (e.isNetwork) return Err(PlayerErrors.network(e.message, cause: e));
      return Err(PlayerErrors.server(e.statusCode, cause: e));
    }
  }
}

/// Pure mapping from `PlayerExecutionPlanResponse` JSON → [FetchedPlan].
Result<FetchedPlan> mapExecutionPlanResponse(Map<String, Object?> json) {
  try {
    final unitId = json['unitId'] as String?;
    final localDate = json['localDate'] as String?;
    final timezone = json['timezone'] as String?;
    final effectivePlanHash = json['effectivePlanHash'] as String?;
    if (unitId == null ||
        localDate == null ||
        timezone == null ||
        effectivePlanHash == null) {
      return Err(
        PlayerErrors.planInvalid('missing required execution-plan fields'),
      );
    }

    final reasonCode = json['reasonCode'] as String? ?? 'unknown';
    final items = <PlanItem>[];

    // Base program items (already carry explicit offsets from the server).
    final rawItems = (json['items'] as List?)?.cast<Map>() ?? const [];
    for (final r in rawItems) {
      final m = r.cast<String, Object?>();
      final position = (m['position'] as num?)?.toInt() ?? items.length;
      items.add(
        PlanItem(
          id: 'item_$position',
          type: PlanItemType.track,
          assetId: m['assetId'] as String?,
          title: m['title'] as String? ?? 'Untitled',
          artist: m['artist'] as String?,
          startOffset: Duration(
            milliseconds: (m['startOffsetMs'] as num?)?.toInt() ?? 0,
          ),
          duration: Duration(
            milliseconds: (m['durationMs'] as num?)?.toInt() ?? 0,
          ),
          sourceReference: m['source'] as String? ?? 'program',
          reasonCode: m['reason'] as String? ?? reasonCode,
        ),
      );
    }

    // Overlays (insert/overlay/interrupt; emergency inferred from reasonCode).
    final rawOverlays = (json['overlays'] as List?)?.cast<Map>() ?? const [];
    var emergencySeen = false;
    for (var i = 0; i < rawOverlays.length; i++) {
      final ov = rawOverlays[i].cast<String, Object?>();
      final kind = ov['kind'] as String? ?? 'overlay';
      final ovReason = ov['reasonCode'] as String? ?? 'overlay';
      final isEmergency = ovReason.contains('emergency');
      emergencySeen = emergencySeen || isEmergency;
      items.add(
        PlanItem(
          id: '${ov['sourceReference'] ?? 'overlay'}_$i',
          type: isEmergency
              ? PlanItemType.emergency
              : switch (kind) {
                  'insert' => PlanItemType.insert,
                  'interrupt' => PlanItemType.interrupt,
                  _ => PlanItemType.overlay,
                },
          assetId: ov['assetId'] as String?,
          title: isEmergency ? 'Emergency' : kind,
          startOffset: Duration(
            milliseconds: (ov['startOffsetMs'] as num?)?.toInt() ?? 0,
          ),
          duration: Duration(
            milliseconds: (ov['durationMs'] as num?)?.toInt() ?? 0,
          ),
          sourceReference: ov['sourceReference'] as String? ?? kind,
          reasonCode: ovReason,
          duckingDb: (ov['duckingDb'] as num?)?.toInt(),
        ),
      );
    }

    // Stable sort by start offset; ties keep insertion order.
    final indexed = items.asMap().entries.toList()
      ..sort((a, b) {
        final c = a.value.startOffset.compareTo(b.value.startOffset);
        return c != 0 ? c : a.key.compareTo(b.key);
      });
    final ordered = indexed.map((e) => e.value).toList();

    final emergencyActive =
        (json['emergencyActive'] as bool? ?? false) || emergencySeen;

    final expiresAt = _parseDate(json['expiresAt']);

    final plan = PlayerPlan(
      unitId: unitId,
      localDate: localDate,
      timezone: timezone,
      basePlanHash: json['basePlanHash'] as String?,
      effectivePlanHash: effectivePlanHash,
      emergencyActive: emergencyActive,
      programId: null,
      reasonCode: reasonCode,
      items: ordered,
      validUntil: expiresAt,
    );

    // Asset descriptors → download URLs + checksums.
    final sourceUris = <String, String>{};
    final checksums = <String, String?>{};
    final rawAssets = (json['assets'] as List?)?.cast<Map>() ?? const [];
    for (final a in rawAssets) {
      final m = a.cast<String, Object?>();
      final assetId = m['assetId'] as String?;
      final url = m['url'] as String?;
      if (assetId == null || url == null) continue;
      sourceUris[assetId] = url;
      checksums[assetId] = m['checksumSha256'] as String?;
    }

    return Ok(
      FetchedPlan(
        plan: plan,
        sourceUris: sourceUris,
        checksums: checksums,
        expiresAt: expiresAt,
      ),
    );
  } catch (e) {
    return Err(
      PlayerErrors.planInvalid(
        'execution-plan mapping failed: $e',
        ctx: {'error': e.toString()},
      ),
    );
  }
}

DateTime? _parseDate(Object? v) => v is String ? DateTime.tryParse(v) : null;
