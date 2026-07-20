import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import '../design_system/theme.dart';
import '../features/net/sync_cycle.dart';
import '../features/playback/fake_playback_engine.dart';
import '../l10n/app_localizations.dart';
import 'player_home.dart';
import 'player_runtime.dart';

/// Root application widget. Sets up localization (pt-BR, en-US, es-ES), the
/// Senvori dark-first theme, and hosts the Player home. Theme mode follows the
/// platform but the Player is designed dark-first for always-on displays.
final class PlayerApp extends StatelessWidget {
  const PlayerApp({
    super.key,
    required this.runtime,
    this.demoEngine,
    this.syncCycle,
  });
  final PlayerRuntime runtime;
  final FakePlaybackEngine? demoEngine;
  final SyncCycle? syncCycle;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      onGenerateTitle: (context) => L10n.of(context).appName,
      debugShowCheckedModeBanner: false,
      theme: SenvoriTheme.light(),
      darkTheme: SenvoriTheme.dark(),
      themeMode: ThemeMode.dark,
      localizationsDelegates: const [
        L10n.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: L10n.supportedLocales,
      home: PlayerHome(
        runtime: runtime,
        demoEngine: demoEngine,
        syncCycle: syncCycle,
      ),
    );
  }
}
