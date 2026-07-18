import 'dart:async';

import '../bootstrap/boot_phase.dart';
import '../core/config/player_config.dart';
import '../core/logging/logger.dart';
import '../core/time/clock.dart';
import '../features/asset_cache/asset_cache.dart';
import '../features/connectivity/connectivity.dart';
import '../features/device_identity/device_identity.dart';
import '../features/device_identity/device_identity_repository.dart';
import '../features/plan_runtime/plan.dart';
import '../features/plan_runtime/plan_store.dart';
import '../features/playback/playback_orchestrator.dart';
import '../features/telemetry/outbox.dart';
import 'player_lifecycle.dart';

/// Composition root and single source of truth for the UI (Sprint 09 · §4).
///
/// The UI observes this object; it never reaches into storage, network or the
/// audio backend directly. [boot] runs the phased bootstrap ([BootPhase]),
/// driving the lifecycle machine to an operational state. Every dependency is
/// injected so the whole runtime is constructible headless in a test.
final class PlayerRuntime {
  PlayerRuntime({
    required this.logger,
    required this.clock,
    required this.monotonic,
    required this.lifecycle,
    required this.identityRepository,
    required this.planStore,
    required this.assetCache,
    required this.connectivity,
    required this.orchestrator,
    required this.outbox,
    required PlayerConfig config,
  }) : _config = config;

  final Logger logger;
  final Clock clock;
  final MonotonicClock monotonic;
  final PlayerLifecycle lifecycle;
  final DeviceIdentityRepository identityRepository;
  final PlanStore planStore;
  final AssetCache assetCache;
  final ConnectivityMonitor connectivity;
  final PlaybackOrchestrator orchestrator;
  final Outbox outbox;

  PlayerConfig _config;
  PlayerConfig get config => _config;
  // ignore: use_setters_to_change_properties
  void updateConfig(PlayerConfig c) => _config = c;

  DeviceIdentity? _identity;
  DeviceIdentity? get identity => _identity;

  final _boot = StreamController<BootProgress>.broadcast();
  Stream<BootProgress> get bootProgress => _boot.stream;

  final _bootStartedMonotonic = <Duration>[];
  Duration get uptime =>
      monotonic.elapsed() -
      (_bootStartedMonotonic.firstOrNull ?? Duration.zero);

  /// Runs the ordered bootstrap. Never throws: a phase failure routes to a
  /// degraded/offline or fatal state as appropriate, and playback still starts
  /// from the last-known-good plan when one exists (offline-first).
  Future<void> boot() async {
    _bootStartedMonotonic.add(monotonic.elapsed());
    logger.info(LogEvent.playerBootStarted, const {});

    _emit(BootPhase.initializingStorage);
    await outbox.restore();

    _emit(BootPhase.loadingIdentity);
    _identity = await identityRepository.loadOrCreate();
    logger.info(LogEvent.deviceIdentityLoaded, {
      'deviceId': _identity!.maskedDeviceId,
    });

    if (!_identity!.isActivated) {
      // Not paired yet: await activation. Bootstrap pauses here; the UI drives
      // the activation flow and calls [completeActivation].
      lifecycle.transition(
        PlayerLifecycleState.awaitingActivation,
        reason: 'not_activated',
      );
      _emit(BootPhase.ready);
      return;
    }

    lifecycle.transition(
      PlayerLifecycleState.loadingConfiguration,
      reason: 'identity_ready',
    );

    _emit(BootPhase.loadingConfiguration);
    // Config is local this sprint; nothing async to load beyond defaults.

    _emit(BootPhase.restoringPlan);
    final restored = await planStore.restore();
    final restoredPlan = restored.fold((p) => p, (_) => null);

    _emit(BootPhase.verifyingAssets);
    await assetCache.restore();

    _emit(BootPhase.initializingAudio);
    if (restoredPlan != null) {
      await orchestrator.loadPlan(restoredPlan);
    }

    _emit(BootPhase.initializingConnectivity);
    await connectivity.evaluate();

    _enterOperationalState(hasPlan: restoredPlan != null);
    _emit(BootPhase.ready);
    logger.info(LogEvent.playerBootCompleted, {
      'hasPlan': restoredPlan != null,
      'online': connectivity.state.canReachApi,
    });
  }

  void _enterOperationalState({required bool hasPlan}) {
    if (!hasPlan) {
      // No cached plan: alive but with nothing to run yet — sync if online,
      // otherwise operate offline until content arrives.
      final target = connectivity.state.canReachApi
          ? PlayerLifecycleState.synchronizing
          : PlayerLifecycleState.offlineOperational;
      lifecycle.transition(target, reason: 'no_cached_plan');
      return;
    }
    // Route through `ready` so the transition is valid from any boot state
    // (loadingConfiguration / synchronizing / offlineOperational all allow it),
    // then settle into the concrete operational state.
    lifecycle.transition(PlayerLifecycleState.ready, reason: 'plan_ready');
    if (orchestrator.emergencyActive) {
      lifecycle.transition(
        PlayerLifecycleState.emergency,
        reason: 'plan_emergency',
      );
    } else if (!connectivity.state.canReachApi) {
      lifecycle.transition(
        PlayerLifecycleState.offlineOperational,
        reason: 'offline_with_plan',
      );
    } else {
      lifecycle.transition(PlayerLifecycleState.playing, reason: 'plan_ready');
    }
  }

  /// Applies a newly received plan through the full pipeline: validate → stage
  /// as pending → ensure assets → activate → load into orchestrator.
  Future<bool> applyPlan(
    PlayerPlan plan, {
    required Map<String, String> sourceUris,
    Map<String, String?> checksums = const {},
    bool requireAllAssetsReady = false,
  }) async {
    final received = planStore.receive(plan);
    if (received.isErr) return false;

    final notReady = await assetCache.ensureForPlan(
      plan,
      sourceUris: sourceUris,
      checksums: checksums,
    );
    if (requireAllAssetsReady && notReady.isNotEmpty) {
      // Keep it pending; the active plan continues. A later readiness check will
      // promote it.
      lifecycle.transition(
        PlayerLifecycleState.synchronizing,
        reason: 'assets_pending',
      );
      return false;
    }

    final activated = await planStore.activatePending(plan.effectivePlanHash);
    if (activated.isErr) return false;

    await orchestrator.loadPlan(plan);
    _enterOperationalState(hasPlan: true);
    return true;
  }

  void _emit(BootPhase phase) {
    if (!_boot.isClosed) _boot.add(BootProgress(phase: phase));
  }

  Future<void> dispose() async {
    await _boot.close();
    await orchestrator.dispose();
    await connectivity.dispose();
    await lifecycle.dispose();
  }
}
