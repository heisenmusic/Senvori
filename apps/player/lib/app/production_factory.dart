/// Production composition root (Sprint 10B).
///
/// Assembles a [PlayerRuntime] wired to the *real* backend adapters — SHA-256
/// integrity, authenticated HTTP, activation gateway, execution-plan gateway,
/// HTTP asset transport, heartbeat, telemetry and a health-based connectivity
/// probe — plus the [ActivationController] and [SyncCycle] that drive them. It is
/// the honest counterpart to [RuntimeFactory.demo].
///
/// Two adapters remain non-production by necessity and are injected as their
/// existing fakes here, documented rather than hidden:
///
///  * **Audio** — real gapless/ducked audio needs a platform plugin
///    (`just_audio`/`media_kit`); [engine] defaults to [FakePlaybackEngine] and
///    accepts a real engine once such an adapter exists (see ADR 0005).
///  * **Secure storage** — the token is persisted via [DocumentTokenStore]
///    (app-private file), not an OS Keystore; `capabilities.secureStorage`
///    stays `false` until a plugin-backed store is wired.
///
/// The caller supplies the [backendStore] backend and [cacheRoot] because
/// resolving real app-private paths on device needs `path_provider` (a plugin),
/// which this dependency-free runtime does not bundle.
library;

import '../core/config/player_config.dart';
import '../core/crypto/sha256_checksum.dart';
import '../core/ids/uuid.dart';
import '../core/logging/logger.dart';
import '../core/persistence/key_value_store.dart';
import '../core/persistence/token_store.dart';
import '../core/time/clock.dart';
import '../features/activation/activation.dart';
import '../features/asset_cache/asset_cache.dart';
import '../features/asset_cache/download_manager.dart';
import '../features/asset_cache/io_adapters.dart';
import '../features/connectivity/connectivity.dart';
import '../features/device_identity/device_identity.dart';
import '../features/device_identity/device_identity_repository.dart';
import '../features/net/activation_gateway_http.dart';
import '../features/net/execution_plan_gateway.dart';
import '../features/net/heartbeat_client.dart';
import '../features/net/http_asset_transport.dart';
import '../features/net/http_connectivity_probe.dart';
import '../features/net/http_telemetry_transport.dart';
import '../features/net/player_backend_config.dart';
import '../features/net/player_http_client.dart';
import '../features/net/sync_cycle.dart';
import '../features/plan_runtime/plan_store.dart';
import '../features/playback/fake_playback_engine.dart';
import '../features/playback/playback_engine.dart';
import '../features/playback/playback_orchestrator.dart';
import '../features/telemetry/outbox.dart';
import 'player_lifecycle.dart';
import 'player_runtime.dart';

/// Everything a production session needs, plus the closables it owns.
final class ProductionRuntime {
  ProductionRuntime({
    required this.runtime,
    required this.activation,
    required this.sync,
    required PlayerHttpClient http,
    required HttpAssetTransport assetTransport,
  }) : _http = http,
       _assetTransport = assetTransport;

  final PlayerRuntime runtime;
  final ActivationController activation;
  final SyncCycle sync;
  final PlayerHttpClient _http;
  final HttpAssetTransport _assetTransport;

  Future<void> dispose() async {
    await runtime.dispose();
    _http.close();
    _assetTransport.close();
  }
}

abstract final class ProductionFactory {
  static ProductionRuntime build({
    required PlayerBackendConfig config,
    required KeyValueStore backendStore,
    required String cacheRoot,
    required String platform,
    String appVersion = '1.0.0',
    DeviceCapabilities capabilities = const DeviceCapabilities(
      audioPlayback: true,
      secureStorage: false,
      keepScreenOn: true,
      kioskMode: false,
    ),
    PlayerConfig playerConfig = const PlayerConfig(),
    AudioPlaybackEngine? engine,
    Clock? clock,
    MonotonicClock? monotonic,
  }) {
    final c = clock ?? const SystemClock();
    final m = monotonic ?? SystemMonotonicClock();
    final logger = Logger(c, sinks: [RingBufferSink()]);
    final store = DocumentStore(backendStore);
    final tokenStore = DocumentTokenStore(store);
    final eng = engine ?? FakePlaybackEngine();

    final http = PlayerHttpClient(
      config: config,
      tokenProvider: tokenStore.readToken,
    );

    // Asset pipeline: real HTTP download + real SHA-256 + real filesystem.
    final assetTransport = HttpAssetTransport(timeout: config.downloadTimeout);
    final downloader = DownloadManager(
      transport: assetTransport,
      fs: const IoFileSystem(),
      checksum: const Sha256Checksum(),
      logger: logger,
      clock: c,
      cacheRoot: cacheRoot,
      maxConcurrency: playerConfig.downloadConcurrency,
    );
    final assetCache = AssetCache(
      store: store,
      downloader: downloader,
      logger: logger,
      clock: c,
    );

    final planStore = PlanStore(store: store, logger: logger);

    final connectivity = ConnectivityMonitor(
      probe: HttpConnectivityProbe(http),
      logger: logger,
    );

    final orchestrator = PlaybackOrchestrator(
      engine: eng,
      logger: logger,
      monotonic: m,
      resolveLocalPath: (assetId) => '$cacheRoot/assets/$assetId',
    );

    final telemetryTransport = HttpTelemetryTransport(
      http: http,
      appVersion: appVersion,
      logger: logger,
    );
    final outbox = Outbox(
      store: store,
      transport: telemetryTransport,
      logger: logger,
      clock: c,
    );

    final identityRepository = DeviceIdentityRepository(
      store: store,
      idGenerator: randomUuidV4,
      platform: platform,
      appVersion: appVersion,
      capabilities: capabilities,
    );

    final runtime = PlayerRuntime(
      logger: logger,
      clock: c,
      monotonic: m,
      lifecycle: PlayerLifecycle(logger: logger, clock: c, monotonic: m),
      identityRepository: identityRepository,
      planStore: planStore,
      assetCache: assetCache,
      connectivity: connectivity,
      orchestrator: orchestrator,
      outbox: outbox,
      config: playerConfig,
    );

    final activationGateway = HttpActivationGateway(
      http: http,
      tokenStore: tokenStore,
      platform: platform,
      appVersion: appVersion,
      capabilities: capabilities,
    );
    final activation = ActivationController(
      gateway: activationGateway,
      clock: c,
    );

    final planGateway = ExecutionPlanGateway(http);
    final heartbeat = HeartbeatClient(http);

    final sync = SyncCycle(
      runtime: runtime,
      logger: logger,
      sendHeartbeat: () => heartbeat.send(
        buildHeartbeatRequest(
          appVersion: appVersion,
          platform: platform,
          runtimeState: _runtimeState(runtime),
          connectivity: _connectivityState(connectivity.state),
          reportedAt: c.now(),
          assetCount: assetCache.entries.length,
          outboxSize: outbox.length,
          activePlanHash: planStore.active?.effectivePlanHash,
          effectivePlanHash: planStore.active?.effectivePlanHash,
        ),
      ),
      fetchPlan: planGateway.fetch,
      flushTelemetry: outbox.flush,
    );

    return ProductionRuntime(
      runtime: runtime,
      activation: activation,
      sync: sync,
      http: http,
      assetTransport: assetTransport,
    );
  }

  /// Coarse runtime-state mapping into the contract vocabulary. Honest and
  /// low-resolution — a richer lifecycle→state map is a follow-up.
  static String _runtimeState(PlayerRuntime runtime) {
    if (!runtime.connectivity.state.canReachApi) return 'offline';
    return runtime.planStore.active != null ? 'playing' : 'idle';
  }

  static String _connectivityState(ConnectivityState state) => switch (state) {
    ConnectivityState.apiReachable => 'apiReachable',
    ConnectivityState.apiDegraded => 'apiReachable',
    ConnectivityState.internetAvailable => 'online',
    ConnectivityState.localOnly => 'offline',
    ConnectivityState.offline => 'offline',
    ConnectivityState.unknown => 'offline',
  };
}
