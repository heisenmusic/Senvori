/// Demo & test fixtures (Sprint 09 · §54). These are explicitly labelled demo
/// data — never presented as production. They let the UI, tests and the soak
/// harness exercise real runtime paths without a backend.
library;

import '../plan_runtime/plan.dart';

abstract final class DemoFixtures {
  static const unitId = 'unit-demo';
  static const tenantId = 'tenant-demo';
  static const syncGroupId = 'sg-demo';

  /// A believable morning-cafe rotation.
  static PlayerPlan cafePlan({
    String localDate = '2026-07-17',
    bool emergency = false,
  }) {
    final tracks = <PlanItem>[
      _track(
        't1',
        'Golden Hour',
        'Aera',
        const Duration(seconds: 182),
        Duration.zero,
      ),
      _track(
        't2',
        'Slow Tide',
        'Marisol',
        const Duration(seconds: 205),
        const Duration(seconds: 182),
      ),
      _track(
        't3',
        'Amber Room',
        'Kestrel',
        const Duration(seconds: 168),
        const Duration(seconds: 387),
      ),
      _track(
        't4',
        'Northlight',
        'Vesna',
        const Duration(seconds: 220),
        const Duration(seconds: 555),
      ),
    ];
    final items = <PlanItem>[...tracks];
    if (emergency) {
      items.add(
        const PlanItem(
          id: 'emg1',
          type: PlanItemType.emergency,
          assetId: 'asset-emergency',
          title: 'Emergency Announcement',
          startOffset: Duration.zero,
          duration: Duration(seconds: 30),
          sourceReference: 'emergency',
          reasonCode: 'emergency_broadcast',
        ),
      );
    }
    return PlayerPlan(
      unitId: unitId,
      tenantId: tenantId,
      syncGroupId: syncGroupId,
      localDate: localDate,
      timezone: 'America/Sao_Paulo',
      basePlanHash: 'base_${localDate.hashCode.toRadixString(16)}',
      effectivePlanHash:
          'eff_${(localDate + (emergency ? 'E' : '')).hashCode.toRadixString(16)}',
      emergencyActive: emergency,
      programId: 'program-cafe-morning',
      reasonCode: 'schedule_match',
      items: items,
    );
  }

  /// Local file paths the demo/fake engine resolves against. In demo mode these
  /// are logical paths; the fake engine never opens them.
  static Map<String, String> assetPaths() => {
    for (final a in [
      'asset-t1',
      'asset-t2',
      'asset-t3',
      'asset-t4',
      'asset-emergency',
    ])
      a: '/demo/$a.dat',
  };

  static PlanItem _track(
    String id,
    String title,
    String artist,
    Duration dur,
    Duration offset,
  ) => PlanItem(
    id: id,
    type: PlanItemType.track,
    assetId: 'asset-$id',
    title: title,
    artist: artist,
    startOffset: offset,
    duration: dur,
    sourceReference: 'program-cafe-morning',
    reasonCode: 'schedule_match',
  );
}
