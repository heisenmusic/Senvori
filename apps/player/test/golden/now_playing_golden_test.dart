import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/core/config/player_config.dart';
import 'package:senvori_player/features/connectivity/connectivity.dart';
import 'package:senvori_player/features/now_playing/now_playing_screen.dart';
import 'package:senvori_player/features/now_playing/now_playing_view_state.dart';

import '../widget/helpers.dart';

/// Golden tests for the visually stable Now Playing surfaces (Sprint 09 · §50).
/// flutter_test uses a deterministic placeholder font, so these render
/// identically across platforms/CI. Kept to a few meaningful, stable states —
/// not a substitute for the behaviour tests.
NowPlayingViewState _base({
  OperationalStatus status = OperationalStatus.playing,
  PlayerMode mode = PlayerMode.operational,
  bool emergency = false,
  TrackView? current = const TrackView(
    title: 'Golden Hour',
    artist: 'Aera',
    kind: 'track',
    seed: 'asset-t1',
  ),
  ConnectivityState connectivity = ConnectivityState.apiReachable,
}) => NowPlayingViewState(
  status: status,
  mode: mode,
  current: current,
  next: const TrackView(title: 'Slow Tide', artist: 'Marisol'),
  position: const Duration(seconds: 45),
  duration: const Duration(seconds: 182),
  unitName: 'Demo Unit',
  programName: 'Café · Morning',
  connectivity: connectivity,
  emergencyActive: emergency,
  localTime: '09:30',
  demoMode: true,
);

void main() {
  testWidgets('now_playing_wide', (tester) async {
    await pumpApp(
      tester,
      NowPlayingScreen(state: _base(), onModeChanged: (_) {}),
      size: const Size(1280, 720),
    );
    await expectLater(
      find.byType(NowPlayingScreen),
      matchesGoldenFile('goldens/now_playing_wide.png'),
    );
  });

  testWidgets('now_playing_no_artwork', (tester) async {
    await pumpApp(
      tester,
      NowPlayingScreen(
        state: _base(current: const TrackView(title: 'Untitled', seed: null)),
        onModeChanged: (_) {},
      ),
      size: const Size(1280, 720),
    );
    await expectLater(
      find.byType(NowPlayingScreen),
      matchesGoldenFile('goldens/now_playing_no_artwork.png'),
    );
  });

  testWidgets('now_playing_offline', (tester) async {
    await pumpApp(
      tester,
      NowPlayingScreen(
        state: _base(
          status: OperationalStatus.offlineOperational,
          connectivity: ConnectivityState.offline,
        ),
        onModeChanged: (_) {},
      ),
      size: const Size(1280, 720),
    );
    await expectLater(
      find.byType(NowPlayingScreen),
      matchesGoldenFile('goldens/now_playing_offline.png'),
    );
  });

  testWidgets('now_playing_emergency', (tester) async {
    await pumpApp(
      tester,
      NowPlayingScreen(
        state: _base(emergency: true, status: OperationalStatus.emergency),
        onModeChanged: (_) {},
      ),
      size: const Size(1280, 720),
    );
    await expectLater(
      find.byType(NowPlayingScreen),
      matchesGoldenFile('goldens/now_playing_emergency.png'),
    );
  });

  testWidgets('now_playing_portrait', (tester) async {
    await pumpApp(
      tester,
      NowPlayingScreen(state: _base(), onModeChanged: (_) {}),
      size: const Size(390, 840),
    );
    await expectLater(
      find.byType(NowPlayingScreen),
      matchesGoldenFile('goldens/now_playing_portrait.png'),
    );
  });
}
