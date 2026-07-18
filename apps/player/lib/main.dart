import 'dart:io';

import 'package:flutter/material.dart';

import 'app/player_app.dart';
import 'app/production_factory.dart';
import 'app/runtime_factory.dart';
import 'core/config/player_config.dart';
import 'core/persistence/file_key_value_store.dart';
import 'features/net/player_backend_config.dart';
import 'features/playback/fake_playback_engine.dart';

/// API origin, supplied at build time via
/// `--dart-define=SENVORI_API_BASE_URL=https://api.example`. When empty (the
/// default) the app ships in **Demo Mode**: the runtime is real (lifecycle, plan
/// validation, offline persistence, orchestration) but wired to in-memory stores
/// and a deterministic fake audio engine.
///
/// When a base URL is provided the app boots the **production** composition root
/// (real authenticated HTTP, activation gateway, execution-plan gateway, HTTP
/// asset download with SHA-256 verification, heartbeat, telemetry and a
/// health-based connectivity probe). Audio still uses the fake engine and the
/// token is stored in an app-private file rather than an OS Keystore — both are
/// documented limitations pending platform plugins (see ADR 0005).
const String _apiBaseUrl = String.fromEnvironment('SENVORI_API_BASE_URL');

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  if (_apiBaseUrl.trim().isEmpty) {
    _runDemo();
  } else {
    _runProduction(_apiBaseUrl.trim());
  }
}

void _runDemo() {
  final engine = FakePlaybackEngine();
  final runtime = RuntimeFactory.demo(
    engine: engine,
    config: const PlayerConfig(flags: FeatureFlags(demoMode: true)),
  );
  runApp(PlayerApp(runtime: runtime, demoEngine: engine));
}

void _runProduction(String baseUrl) {
  // Storage/cache roots. Robust device paths need `path_provider` (a plugin);
  // as a dependency-free fallback we anchor under the system temp dir, which is
  // honest for desktop/dev and clearly a follow-up for hardened Android storage.
  final root = Directory('${Directory.systemTemp.path}/senvori_player');
  final storageDir = Directory('${root.path}/store')
    ..createSync(recursive: true);
  final cacheRoot = '${root.path}/cache';

  final platform = Platform.isAndroid
      ? 'android'
      : (Platform.isWindows ? 'windows' : 'web');

  final production = ProductionFactory.build(
    config: PlayerBackendConfig(baseUrl: baseUrl),
    backendStore: FileKeyValueStore(storageDir),
    cacheRoot: cacheRoot,
    platform: platform,
  );

  runApp(PlayerApp(runtime: production.runtime, syncCycle: production.sync));
}
