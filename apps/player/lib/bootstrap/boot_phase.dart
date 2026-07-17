/// Bootstrap phases (Sprint 09 · §10). The Player boots in explicit, ordered
/// phases and reports *real* progress — no infinite fake spinner and no white
/// screen. Operator-facing labels are resolved via l10n from [messageKey].
library;

enum BootPhase {
  initializingStorage,
  loadingIdentity,
  loadingConfiguration,
  restoringPlan,
  verifyingAssets,
  initializingAudio,
  initializingConnectivity,
  ready,
}

extension BootPhaseX on BootPhase {
  /// Fraction complete once this phase finishes, in [0,1].
  double get progress => (index + 1) / BootPhase.values.length;

  /// l10n key for the operator-facing label.
  String get messageKey => switch (this) {
    BootPhase.initializingStorage => 'bootPreparing',
    BootPhase.loadingIdentity => 'bootLoadingConfig',
    BootPhase.loadingConfiguration => 'bootLoadingConfig',
    BootPhase.restoringPlan => 'bootPreparingSchedule',
    BootPhase.verifyingAssets => 'bootValidatingContent',
    BootPhase.initializingAudio => 'bootPreparingSchedule',
    BootPhase.initializingConnectivity => 'bootPreparingSchedule',
    BootPhase.ready => 'bootReady',
  };
}

final class BootProgress {
  const BootProgress({required this.phase, this.error});
  final BootPhase phase;
  final String? error;
  double get fraction => phase.progress;
}
