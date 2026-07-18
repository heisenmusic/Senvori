import 'dart:async';

import 'package:flutter/material.dart';

import '../bootstrap/boot_phase.dart';
import '../core/config/player_config.dart';
import '../features/demo/demo_fixtures.dart';
import '../features/now_playing/boot_screen.dart';
import '../features/now_playing/now_playing_screen.dart';
import '../features/now_playing/now_playing_view_state.dart';
import '../features/playback/fake_playback_engine.dart';
import '../features/playback/playback_orchestrator.dart';
import 'player_lifecycle.dart';
import 'player_runtime.dart';
import 'view_state_mapper.dart';

/// Wires the [PlayerRuntime] to the UI. It boots the runtime, loads a demo
/// plan, and (in demo/fake-engine mode) advances virtual playback on a light
/// timer so the experience is alive. All UI state is derived from the runtime —
/// the widget is a view, never the source of truth (Sprint 09 · §4).
final class PlayerHome extends StatefulWidget {
  const PlayerHome({
    super.key,
    required this.runtime,
    this.demoEngine,
    this.autoAdvance = true,
  });
  final PlayerRuntime runtime;

  /// When provided (demo mode), virtual playback position advances on a light
  /// timer so the experience is alive. Production wires a real audio backend and
  /// leaves this null. Tests pass null and drive time themselves.
  final FakePlaybackEngine? demoEngine;

  final bool autoAdvance;

  @override
  State<PlayerHome> createState() => _PlayerHomeState();
}

class _PlayerHomeState extends State<PlayerHome> {
  bool _booting = true;
  BootProgress _progress = const BootProgress(
    phase: BootPhase.initializingStorage,
  );
  OrchestratorSnapshot _orchestrator = OrchestratorSnapshot.idle;
  PlayerMode _mode = PlayerMode.ambient;
  Timer? _ticker;
  final _subs = <StreamSubscription>[];

  PlayerRuntime get runtime => widget.runtime;

  @override
  void initState() {
    super.initState();
    _subs.add(
      runtime.bootProgress.listen((p) => setState(() => _progress = p)),
    );
    _subs.add(
      runtime.orchestrator.snapshots.listen(
        (s) => setState(() => _orchestrator = s),
      ),
    );
    _subs.add(runtime.lifecycle.changes.listen((_) => setState(() {})));
    _subs.add(runtime.connectivity.changes.listen((_) => setState(() {})));
    unawaited(_start());
  }

  Future<void> _start() async {
    await runtime.boot();
    // Demo: apply the café plan so there is something to show.
    await runtime.applyPlan(DemoFixtures.cafePlan(), sourceUris: const {});
    if (!mounted) return;
    setState(() => _booting = false);
    _startTicker();
  }

  void _startTicker() {
    final fake = widget.demoEngine;
    if (!widget.autoAdvance || fake == null) return;
    _ticker = Timer.periodic(const Duration(milliseconds: 500), (_) {
      fake.tick(const Duration(milliseconds: 500));
      if (!mounted) return;
      setState(() {});
      if (!runtime.orchestrator.emergencyActive) {
        runtime.lifecycle.transition(
          PlayerLifecycleState.playing,
          reason: 'demo_tick',
        );
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    for (final s in _subs) {
      s.cancel();
    }
    super.dispose();
  }

  NowPlayingViewState _viewState() {
    final o = _orchestrator;
    final status = ViewStateMapper.status(
      lifecycle: runtime.lifecycle.state,
      orchestrator: o,
      connectivity: runtime.connectivity.state,
    );
    final cur = o.current;
    final next = o.next;
    return NowPlayingViewState(
      status: status,
      mode: _mode,
      current: cur == null
          ? null
          : TrackView(
              title: cur.title,
              artist: cur.artist,
              kind: cur.type.name,
              seed: cur.assetId ?? cur.id,
            ),
      next: next == null
          ? null
          : TrackView(title: next.title, artist: next.artist),
      position: o.playback.position,
      duration: o.playback.duration,
      unitName: runtime.identity?.friendlyName ?? 'Unit',
      programName: 'Café · Morning',
      connectivity: runtime.connectivity.state,
      emergencyActive: o.emergencyActive,
      localTime: _formatClock(runtime.clock.now()),
      demoMode: runtime.config.flags.demoMode,
      volume: o.playback.volume,
    );
  }

  static String _formatClock(DateTime t) =>
      '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    if (_booting) return BootScreen(progress: _progress);
    return NowPlayingScreen(
      state: _viewState(),
      onModeChanged: (m) => setState(() => _mode = m),
    );
  }
}
