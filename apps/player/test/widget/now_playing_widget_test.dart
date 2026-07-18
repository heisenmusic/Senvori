import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:senvori_player/bootstrap/boot_phase.dart';
import 'package:senvori_player/core/config/player_config.dart';
import 'package:senvori_player/features/activation/activation.dart';
import 'package:senvori_player/features/activation/activation_screen.dart';
import 'package:senvori_player/features/connectivity/connectivity.dart';
import 'package:senvori_player/features/diagnostics/diagnostics_screen.dart';
import 'package:senvori_player/features/now_playing/boot_screen.dart';
import 'package:senvori_player/features/now_playing/now_playing_screen.dart';
import 'package:senvori_player/features/now_playing/now_playing_view_state.dart';

import 'helpers.dart';

NowPlayingViewState _state({
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
  testWidgets('Now Playing shows current title, artist and up-next', (
    tester,
  ) async {
    await pumpApp(
      tester,
      NowPlayingScreen(state: _state(), onModeChanged: (_) {}),
    );
    expect(find.text('Golden Hour'), findsOneWidget);
    expect(find.text('Aera'), findsOneWidget);
    expect(find.text('Slow Tide · Marisol'), findsOneWidget);
  });

  testWidgets('Now Playing renders an empty state when there is no content', (
    tester,
  ) async {
    await pumpApp(
      tester,
      NowPlayingScreen(
        state: _state(current: null, status: OperationalStatus.noContent),
        onModeChanged: (_) {},
      ),
    );
    expect(find.byIcon(Icons.library_music_outlined), findsWidgets);
  });

  testWidgets('Emergency banner appears when emergency is active', (
    tester,
  ) async {
    await pumpApp(
      tester,
      NowPlayingScreen(
        state: _state(emergency: true, status: OperationalStatus.emergency),
        onModeChanged: (_) {},
      ),
    );
    expect(find.byIcon(Icons.warning_amber_rounded), findsWidgets);
  });

  testWidgets('Offline status shows the offline detail in operational mode', (
    tester,
  ) async {
    await pumpApp(
      tester,
      NowPlayingScreen(
        state: _state(
          status: OperationalStatus.offlineOperational,
          connectivity: ConnectivityState.offline,
        ),
        onModeChanged: (_) {},
      ),
    );
    expect(find.text('Local programming stays available'), findsOneWidget);
  });

  testWidgets(
    'Now Playing renders in portrait (narrow) layout without overflow',
    (tester) async {
      await pumpApp(
        tester,
        NowPlayingScreen(state: _state(), onModeChanged: (_) {}),
        size: const Size(390, 840),
      );
      expect(tester.takeException(), isNull);
      expect(find.text('Golden Hour'), findsOneWidget);
    },
  );

  testWidgets('Boot screen shows a real progress label', (tester) async {
    await pumpApp(
      tester,
      const BootScreen(
        progress: BootProgress(phase: BootPhase.verifyingAssets),
      ),
    );
    expect(find.text('Validating local content'), findsOneWidget);
  });

  testWidgets('Activation screen shows a grouped code and instructions', (
    tester,
  ) async {
    await pumpApp(
      tester,
      ActivationScreen(
        phase: ActivationPhase.awaiting,
        code: ActivationCode(code: 'SENV1234', expiresAt: DateTime.utc(2030)),
        onRetry: () {},
      ),
      settle: false,
    );
    expect(find.text('SENV-1234'), findsOneWidget);
    expect(find.text('Open the Dashboard and enter this code'), findsOneWidget);
  });

  testWidgets('Diagnostics screen lists sanitized rows and no raw secrets', (
    tester,
  ) async {
    await pumpApp(
      tester,
      const DiagnosticsScreen(
        data: DiagnosticsData(
          maskedDeviceId: 'dev_ab…9f',
          unit: 'unit-demo',
          tenant: 'tenant-demo',
          appVersion: '1.0.0',
          schemaVersion: '1',
          activePlanHash: 'eff1',
          basePlanHash: 'base1',
          effectivePlanHash: 'eff1',
          lastSync: '09:30',
          connectivity: 'apiReachable',
          disk: '4.0 GB free',
          assets: '4 ready',
          queue: '4 items',
          uptime: '02:15:00',
          platform: 'linux',
          recentEvents: ['playback_started itemId=t1'],
        ),
      ),
    );
    expect(find.text('dev_ab…9f'), findsOneWidget);
    expect(find.textContaining('token'), findsNothing);
  });

  testWidgets('Spanish locale renders localized status', (tester) async {
    await pumpApp(
      tester,
      NowPlayingScreen(
        state: _state(status: OperationalStatus.offlineOperational),
        onModeChanged: (_) {},
      ),
      locale: const Locale('es'),
    );
    expect(find.text('La programación local sigue disponible'), findsOneWidget);
  });
}
