import '../core/config/player_config.dart';
import '../core/logging/logger.dart';
import '../core/persistence/key_value_store.dart';
import '../core/time/clock.dart';
import '../features/asset_cache/asset_cache.dart';
import '../features/asset_cache/download_manager.dart';
import '../features/asset_cache/io_adapters.dart';
import '../features/asset_cache/ports.dart';
import '../features/connectivity/connectivity.dart';
import '../features/device_identity/device_identity.dart';
import '../features/device_identity/device_identity_repository.dart';
import '../features/plan_runtime/plan_store.dart';
import '../features/playback/fake_playback_engine.dart';
import '../features/playback/playback_engine.dart';
import '../features/playback/playback_orchestrator.dart';
import '../features/telemetry/outbox.dart';
import 'player_lifecycle.dart';
import 'player_runtime.dart';

/// A connectivity probe returning a fixed, scriptable state — used for demo and
/// tests. Production swaps in a probe that pings a health endpoint.
final class ScriptedConnectivityProbe implements ConnectivityProbe {
  ScriptedConnectivityProbe(this.state);
  ConnectivityState state;
  @override
  Future<ConnectivityState> probe() async => state;
}

/// A no-op transport for downloads used in demo mode (no real assets fetched).
final class NullAssetTransport implements AssetTransport {
  const NullAssetTransport();
  @override
  Future<DownloadOutcome> fetch(
    String uri, {
    void Function(int, int?)? onProgress,
  }) async => const DownloadOutcome(bytes: []);
}

/// Assembles a fully in-memory [PlayerRuntime] for demo mode and tests. Every
/// dependency is a fake/in-memory adapter, so it boots without a backend, disk
/// or audio device — the honest "runtime is real, infra is stubbed" posture of
/// this sprint.
final class RuntimeFactory {
  static PlayerRuntime demo({
    Clock? clock,
    MonotonicClock? monotonic,
    ConnectivityState connectivity = ConnectivityState.apiReachable,
    AudioPlaybackEngine? engine,
    bool activated = true,
    InMemoryKeyValueStore? backend,
    PlayerConfig config = const PlayerConfig(
      flags: FeatureFlags(demoMode: true),
    ),
  }) {
    final c = clock ?? FakeClock(DateTime.utc(2026, 7, 17, 9, 30));
    final m = monotonic ?? FakeMonotonicClock();
    final logger = Logger(c, sinks: [RingBufferSink()]);
    final backendStore = backend ?? InMemoryKeyValueStore();
    final store = DocumentStore(backendStore);
    final eng = engine ?? FakePlaybackEngine();

    final identityRepo = DeviceIdentityRepository(
      store: store,
      idGenerator: () => 'dev_demo_0001',
      platform: 'demo',
      appVersion: '1.0.0',
      capabilities: const DeviceCapabilities(
        audioPlayback: true,
        secureStorage: false,
        keepScreenOn: true,
        kioskMode: false,
      ),
    );
    if (activated) {
      // Pre-seed an activated identity so demo boots straight to Now Playing.
      backendStore.seedRaw(
        'device_identity',
        '{"schemaVersion":1,"data":{"deviceId":"dev_demo_0001","platform":"demo","appVersion":"1.0.0",'
            '"activationStatus":"activated","tenantId":"tenant-demo","unitId":"unit-demo",'
            '"syncGroupId":"sg-demo","friendlyName":"Demo Unit","capabilities":{"audioPlayback":true}}}',
      );
    }

    final downloader = DownloadManager(
      transport: const NullAssetTransport(),
      fs: const IoFileSystem(),
      checksum: const Fnv1aChecksum(),
      logger: logger,
      clock: c,
      cacheRoot: '/demo/cache',
    );
    final assetCache = AssetCache(
      store: store,
      downloader: downloader,
      logger: logger,
      clock: c,
    );
    final planStore = PlanStore(store: store, logger: logger);
    final connectivityMonitor = ConnectivityMonitor(
      probe: ScriptedConnectivityProbe(connectivity),
      logger: logger,
    );
    final orchestrator = PlaybackOrchestrator(
      engine: eng,
      logger: logger,
      monotonic: m,
      // In demo mode every referenced asset resolves to a logical path.
      resolveLocalPath: (assetId) => '/demo/$assetId.dat',
    );
    final outbox = Outbox(
      store: store,
      transport: MockTelemetryTransport(),
      logger: logger,
      clock: c,
    );

    return PlayerRuntime(
      logger: logger,
      clock: c,
      monotonic: m,
      lifecycle: PlayerLifecycle(logger: logger, clock: c, monotonic: m),
      identityRepository: identityRepo,
      planStore: planStore,
      assetCache: assetCache,
      connectivity: connectivityMonitor,
      orchestrator: orchestrator,
      outbox: outbox,
      config: config,
    );
  }
}
