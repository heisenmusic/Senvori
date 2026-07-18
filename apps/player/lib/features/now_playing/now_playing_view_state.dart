import '../../core/config/player_config.dart';
import '../connectivity/connectivity.dart';

/// Immutable view state for the Now Playing surfaces. Screens render this and
/// nothing else, which keeps them pure and makes widget/golden tests
/// deterministic (Sprint 09 · §49–§50). A controller maps the live runtime into
/// this object.
enum OperationalStatus {
  online,
  offlineOperational,
  syncing,
  downloading,
  ready,
  playing,
  degraded,
  emergency,
  noPlan,
  noContent,
  storageLow,
}

final class TrackView {
  const TrackView({required this.title, this.artist, this.kind, this.seed});
  final String title;
  final String? artist;
  final String? kind;

  /// Deterministic seed for ambient artwork when no cover exists.
  final String? seed;
}

final class NowPlayingViewState {
  const NowPlayingViewState({
    required this.status,
    required this.mode,
    required this.current,
    required this.next,
    required this.position,
    required this.duration,
    required this.unitName,
    required this.programName,
    required this.connectivity,
    required this.emergencyActive,
    required this.localTime,
    required this.demoMode,
    this.volume = 1.0,
  });

  final OperationalStatus status;
  final PlayerMode mode;
  final TrackView? current;
  final TrackView? next;
  final Duration position;
  final Duration duration;
  final String unitName;
  final String programName;
  final ConnectivityState connectivity;
  final bool emergencyActive;
  final String localTime;
  final bool demoMode;
  final double volume;

  bool get hasContent => current != null;

  static const empty = NowPlayingViewState(
    status: OperationalStatus.noPlan,
    mode: PlayerMode.ambient,
    current: null,
    next: null,
    position: Duration.zero,
    duration: Duration.zero,
    unitName: '—',
    programName: '—',
    connectivity: ConnectivityState.unknown,
    emergencyActive: false,
    localTime: '',
    demoMode: false,
  );

  NowPlayingViewState copyWith({
    OperationalStatus? status,
    PlayerMode? mode,
    TrackView? current,
    TrackView? next,
    Duration? position,
    Duration? duration,
    ConnectivityState? connectivity,
    bool? emergencyActive,
    String? localTime,
    double? volume,
  }) => NowPlayingViewState(
    status: status ?? this.status,
    mode: mode ?? this.mode,
    current: current ?? this.current,
    next: next ?? this.next,
    position: position ?? this.position,
    duration: duration ?? this.duration,
    unitName: unitName,
    programName: programName,
    connectivity: connectivity ?? this.connectivity,
    emergencyActive: emergencyActive ?? this.emergencyActive,
    localTime: localTime ?? this.localTime,
    demoMode: demoMode,
    volume: volume ?? this.volume,
  );
}
