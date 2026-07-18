import 'package:flutter/material.dart';

import 'app/player_app.dart';
import 'app/runtime_factory.dart';
import 'core/config/player_config.dart';
import 'features/playback/fake_playback_engine.dart';

/// Entry point. This sprint ships in **Demo Mode**: the runtime is real
/// (lifecycle, plan validation, offline persistence, orchestration) but wired to
/// in-memory stores and a deterministic fake audio engine, since no production
/// backend or audio integration exists yet. This is labelled clearly in-app and
/// documented honestly in PLAYER_RUNTIME.md.
void main() {
  WidgetsFlutterBinding.ensureInitialized();

  final engine = FakePlaybackEngine();
  final runtime = RuntimeFactory.demo(
    engine: engine,
    config: const PlayerConfig(flags: FeatureFlags(demoMode: true)),
  );

  runApp(PlayerApp(runtime: runtime, demoEngine: engine));
}
