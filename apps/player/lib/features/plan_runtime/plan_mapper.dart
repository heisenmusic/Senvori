import '../../core/errors/player_error.dart';
import '../../core/result/result.dart';
import 'plan.dart';

/// Maps the API's effective-plan wire shape (Sprint 08 `EffectivePlanDto`) plus
/// a resolved program item list into the Player's domain [PlayerPlan].
///
/// The wire `EffectivePlanDto` describes *which* program is active and *what*
/// overlays apply, but not the ordered playable items themselves — those come
/// from the resolved program's item list (a separate endpoint). This mapper
/// accepts both and produces one merged, ordered timeline. Keeping this as a
/// pure function (Map in, Result out) makes it exhaustively testable and keeps
/// DTO knowledge out of the runtime.
abstract final class PlanMapper {
  /// [effectivePlan] is the decoded `EffectivePlanDto` JSON.
  /// [programItems] is the ordered list of base program items (may be empty
  /// when only overlays exist, e.g. an all-emergency plan).
  static Result<PlayerPlan> fromWire({
    required Map<String, Object?> effectivePlan,
    required List<Map<String, Object?>> programItems,
  }) {
    try {
      final unitId = effectivePlan['unitId'] as String?;
      final localDate = effectivePlan['localDate'] as String?;
      final timezone = effectivePlan['timezone'] as String?;
      final effectivePlanHash = effectivePlan['effectivePlanHash'] as String?;
      if (unitId == null ||
          localDate == null ||
          timezone == null ||
          effectivePlanHash == null) {
        return Err(
          PlayerErrors.planInvalid('missing required effective-plan fields'),
        );
      }

      final resolution =
          (effectivePlan['resolution'] as Map?)?.cast<String, Object?>() ??
          const {};
      final reasonCode = resolution['reasonCode'] as String? ?? 'unknown';
      final programId = resolution['selectedProgramId'] as String?;

      final items = <PlanItem>[];

      // Base program items become tracks, laid end-to-end from offset 0.
      var cursor = Duration.zero;
      for (final raw in programItems) {
        final durMs = (raw['durationMs'] as num?)?.toInt() ?? 0;
        items.add(
          PlanItem(
            id: raw['id'] as String? ?? 'item_${items.length}',
            type: PlanItemType.track,
            assetId: raw['assetId'] as String?,
            title: raw['title'] as String? ?? 'Untitled',
            artist: raw['artist'] as String?,
            startOffset: cursor,
            duration: Duration(milliseconds: durMs),
            sourceReference: programId ?? 'program',
            reasonCode: reasonCode,
          ),
        );
        cursor += Duration(milliseconds: durMs);
      }

      // Overlays (insert/overlay/interrupt, incl. emergency) become items with
      // an explicit start offset from the wire.
      final overlays =
          (effectivePlan['overlays'] as List?)?.cast<Map>() ?? const [];
      var emergencySeen = false;
      for (final o in overlays) {
        final ov = o.cast<String, Object?>();
        final kind = ov['kind'] as String? ?? 'overlay';
        final ovReason = ov['reasonCode'] as String? ?? 'overlay';
        final isEmergency = ovReason.contains('emergency');
        emergencySeen = emergencySeen || isEmergency;
        items.add(
          PlanItem(
            id: '${ov['sourceReference'] ?? 'overlay'}_${items.length}',
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

      // Stable sort by start offset so the timeline is walkable; ties keep
      // insertion order (Dart's sort is not stable, so use an indexed compare).
      final indexed = items.asMap().entries.toList()
        ..sort((a, b) {
          final c = a.value.startOffset.compareTo(b.value.startOffset);
          return c != 0 ? c : a.key.compareTo(b.key);
        });
      final ordered = indexed.map((e) => e.value).toList();

      final emergencyActive =
          (effectivePlan['emergencyActive'] as bool? ?? false) || emergencySeen;

      return Ok(
        PlayerPlan(
          unitId: unitId,
          localDate: localDate,
          timezone: timezone,
          basePlanHash: effectivePlan['basePlanHash'] as String?,
          effectivePlanHash: effectivePlanHash,
          emergencyActive: emergencyActive,
          programId: programId,
          reasonCode: reasonCode,
          items: ordered,
          warnings: ((effectivePlan['warnings'] as List?) ?? const [])
              .map((w) => (w as Map)['code']?.toString() ?? 'warning')
              .toList(),
        ),
      );
    } catch (e) {
      return Err(
        PlayerErrors.planInvalid(
          'mapping failed: $e',
          ctx: {'error': e.toString()},
        ),
      );
    }
  }
}
