/// Player plan domain model (Sprint 09 · §13–§14).
///
/// This is the Player's *internal* representation, deliberately decoupled from
/// the API DTOs (`EffectivePlanDto` in `@senvori/contracts`). The mapper in
/// `plan_mapper.dart` translates the wire shape into this domain; the UI and
/// runtime only ever touch the domain. That boundary means a contract change on
/// the wire never leaks into playback logic.
library;

enum OverlayKind { insert, overlay, interrupt }

enum PlanItemType { track, insert, overlay, interrupt, emergency }

/// A single schedulable/playable unit in the day's timeline.
final class PlanItem {
  const PlanItem({
    required this.id,
    required this.type,
    required this.assetId,
    required this.title,
    required this.startOffset,
    required this.duration,
    required this.sourceReference,
    required this.reasonCode,
    this.artist,
    this.duckingDb,
  });

  final String id;
  final PlanItemType type;

  /// May be null for policy-only items (e.g. a silence/interrupt placeholder).
  final String? assetId;
  final String title;
  final String? artist;

  /// Offset from the start of the plan's local day.
  final Duration startOffset;
  final Duration duration;

  /// Where this item came from (assignment id, event id) for auditability.
  final String sourceReference;
  final String reasonCode;

  /// Optional ducking applied to the underlying bed while this plays.
  final int? duckingDb;

  bool get isEmergency => type == PlanItemType.emergency;
  bool get isInterrupt =>
      type == PlanItemType.interrupt || type == PlanItemType.emergency;
}

/// The validated, ready-to-run plan for one unit on one local date.
final class PlayerPlan {
  const PlayerPlan({
    required this.unitId,
    required this.localDate,
    required this.timezone,
    required this.basePlanHash,
    required this.effectivePlanHash,
    required this.emergencyActive,
    required this.items,
    required this.reasonCode,
    this.tenantId,
    this.syncGroupId,
    this.programId,
    this.validUntil,
    this.warnings = const [],
  });

  final String unitId;
  final String? tenantId;
  final String? syncGroupId;

  /// `YYYY-MM-DD` in [timezone].
  final String localDate;
  final String timezone;

  /// Shared identity across a sync group (soft sync). Null when no base program.
  final String? basePlanHash;

  /// Per-unit hash incorporating overlays and emergency state.
  final String effectivePlanHash;
  final bool emergencyActive;
  final String? programId;

  final List<PlanItem> items;
  final String reasonCode;

  /// Optional local-date validity boundary; a plan past this is degraded.
  final DateTime? validUntil;
  final List<String> warnings;

  /// Distinct asset ids the plan references, in first-appearance order. Used to
  /// drive cache warming.
  List<String> get referencedAssetIds {
    final seen = <String>{};
    final out = <String>[];
    for (final item in items) {
      final a = item.assetId;
      if (a != null && seen.add(a)) out.add(a);
    }
    return out;
  }

  /// Emergency items take priority; returns them in timeline order.
  List<PlanItem> get emergencyItems =>
      items.where((i) => i.isEmergency).toList();

  PlayerPlan copyWith({List<String>? warnings}) => PlayerPlan(
    unitId: unitId,
    tenantId: tenantId,
    syncGroupId: syncGroupId,
    localDate: localDate,
    timezone: timezone,
    basePlanHash: basePlanHash,
    effectivePlanHash: effectivePlanHash,
    emergencyActive: emergencyActive,
    programId: programId,
    items: items,
    reasonCode: reasonCode,
    validUntil: validUntil,
    warnings: warnings ?? this.warnings,
  );

  Map<String, Object?> toJson() => {
    'unitId': unitId,
    'tenantId': tenantId,
    'syncGroupId': syncGroupId,
    'localDate': localDate,
    'timezone': timezone,
    'basePlanHash': basePlanHash,
    'effectivePlanHash': effectivePlanHash,
    'emergencyActive': emergencyActive,
    'programId': programId,
    'reasonCode': reasonCode,
    'validUntil': validUntil?.toIso8601String(),
    'warnings': warnings,
    'items': items
        .map(
          (i) => {
            'id': i.id,
            'type': i.type.name,
            'assetId': i.assetId,
            'title': i.title,
            'artist': i.artist,
            'startOffsetMs': i.startOffset.inMilliseconds,
            'durationMs': i.duration.inMilliseconds,
            'sourceReference': i.sourceReference,
            'reasonCode': i.reasonCode,
            'duckingDb': i.duckingDb,
          },
        )
        .toList(),
  };

  static PlayerPlan fromJson(Map<String, Object?> j) => PlayerPlan(
    unitId: j['unitId'] as String,
    tenantId: j['tenantId'] as String?,
    syncGroupId: j['syncGroupId'] as String?,
    localDate: j['localDate'] as String,
    timezone: j['timezone'] as String,
    basePlanHash: j['basePlanHash'] as String?,
    effectivePlanHash: j['effectivePlanHash'] as String,
    emergencyActive: j['emergencyActive'] as bool? ?? false,
    programId: j['programId'] as String?,
    reasonCode: j['reasonCode'] as String? ?? 'unknown',
    validUntil: j['validUntil'] is String
        ? DateTime.tryParse(j['validUntil'] as String)
        : null,
    warnings: (j['warnings'] as List?)?.cast<String>() ?? const [],
    items: ((j['items'] as List?) ?? const [])
        .cast<Map<String, Object?>>()
        .map(
          (m) => PlanItem(
            id: m['id'] as String,
            type: PlanItemType.values.firstWhere(
              (t) => t.name == m['type'],
              orElse: () => PlanItemType.track,
            ),
            assetId: m['assetId'] as String?,
            title: m['title'] as String? ?? '',
            artist: m['artist'] as String?,
            startOffset: Duration(
              milliseconds: (m['startOffsetMs'] as num?)?.toInt() ?? 0,
            ),
            duration: Duration(
              milliseconds: (m['durationMs'] as num?)?.toInt() ?? 0,
            ),
            sourceReference: m['sourceReference'] as String? ?? '',
            reasonCode: m['reasonCode'] as String? ?? 'unknown',
            duckingDb: (m['duckingDb'] as num?)?.toInt(),
          ),
        )
        .toList(),
  );
}
