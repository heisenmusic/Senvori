import '../features/connectivity/connectivity.dart';
import '../features/now_playing/now_playing_view_state.dart';
import '../features/playback/playback_orchestrator.dart';
import 'player_lifecycle.dart';

/// Maps the live runtime (lifecycle + orchestrator + connectivity) into the
/// pure [OperationalStatus] the UI renders. Kept as a pure function so the
/// mapping is unit-tested independently of any widget.
abstract final class ViewStateMapper {
  static OperationalStatus status({
    required PlayerLifecycleState lifecycle,
    required OrchestratorSnapshot orchestrator,
    required ConnectivityState connectivity,
    bool storageLow = false,
  }) {
    if (storageLow) return OperationalStatus.storageLow;
    if (orchestrator.emergencyActive ||
        lifecycle == PlayerLifecycleState.emergency) {
      return OperationalStatus.emergency;
    }
    if (orchestrator.degraded || lifecycle == PlayerLifecycleState.degraded) {
      return OperationalStatus.degraded;
    }
    switch (lifecycle) {
      case PlayerLifecycleState.synchronizing:
        return OperationalStatus.syncing;
      case PlayerLifecycleState.offlineOperational:
        return OperationalStatus.offlineOperational;
      case PlayerLifecycleState.playing:
        return orchestrator.current == null
            ? OperationalStatus.noContent
            : OperationalStatus.playing;
      case PlayerLifecycleState.ready:
        return OperationalStatus.ready;
      case PlayerLifecycleState.pausedByPolicy:
        return OperationalStatus.ready;
      case PlayerLifecycleState.booting:
      case PlayerLifecycleState.awaitingActivation:
      case PlayerLifecycleState.loadingConfiguration:
        return OperationalStatus.noPlan;
      case PlayerLifecycleState.fatalError:
        return OperationalStatus.degraded;
      case PlayerLifecycleState.degraded:
        return OperationalStatus.degraded;
      case PlayerLifecycleState.emergency:
        return OperationalStatus.emergency;
    }
  }
}
