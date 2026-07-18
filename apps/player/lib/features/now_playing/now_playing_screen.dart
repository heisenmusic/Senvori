import 'package:flutter/material.dart';

import '../../core/config/player_config.dart';
import '../../design_system/ambient_artwork.dart';
import '../../design_system/components.dart';
import '../../design_system/tokens.dart';
import '../../l10n/app_localizations.dart';
import 'now_playing_view_state.dart';
import 'status_descriptor.dart';

/// The Now Playing experience (Sprint 09 · §24). Focus is on three things only:
/// **Now**, **Next**, **State**. It is not an admin panel. Ambient, Operational
/// and Diagnostics are distinct modes (§25) — never merged into one screen.
///
/// The screen is pure: it renders [state] and reports intents via callbacks, so
/// it is deterministic under widget and golden tests. Ambient motion is driven
/// by an injectable [ambientPhase]; passing a constant (or reduce-motion) yields
/// a still frame.
final class NowPlayingScreen extends StatelessWidget {
  const NowPlayingScreen({
    super.key,
    required this.state,
    required this.onModeChanged,
    this.onOpenDiagnostics,
    this.ambientPhase = 0,
  });

  final NowPlayingViewState state;
  final ValueChanged<PlayerMode> onModeChanged;
  final VoidCallback? onOpenDiagnostics;
  final double ambientPhase;

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final reduceMotion =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    final seed = state.current?.seed ?? 'senvori-ambient';

    return Scaffold(
      backgroundColor: SenvoriColors.surface0,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Deterministic ambient field behind everything.
          AmbientArtwork(
            seed: seed,
            phase: reduceMotion ? 0 : ambientPhase,
            dimmed: state.mode != PlayerMode.ambient,
          ),
          if (state.emergencyActive)
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: EmergencyBanner(message: l10n.emergencyBanner),
            ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(SenvoriSpacing.xl),
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final wide = constraints.maxWidth > 720;
                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _TopBar(
                        state: state,
                        l10n: l10n,
                        wide: wide,
                        onModeChanged: onModeChanged,
                        onOpenDiagnostics: onOpenDiagnostics,
                      ),
                      const SizedBox(height: SenvoriSpacing.lg),
                      Expanded(
                        child: wide
                            ? _WideBody(state: state, l10n: l10n, seed: seed)
                            : _NarrowBody(state: state, l10n: l10n, seed: seed),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({
    required this.state,
    required this.l10n,
    required this.wide,
    required this.onModeChanged,
    this.onOpenDiagnostics,
  });
  final NowPlayingViewState state;
  final L10n l10n;
  final bool wide;
  final ValueChanged<PlayerMode> onModeChanged;
  final VoidCallback? onOpenDiagnostics;

  @override
  Widget build(BuildContext context) {
    final conn = StatusDescriptor.connectivity(state.connectivity, l10n);
    final unit = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          state.unitName,
          style: SenvoriType.subtitle(SenvoriColors.textPrimary),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        Text(
          state.programName,
          style: SenvoriType.label(SenvoriColors.textTertiary),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
    final controls = <Widget>[
      if (state.demoMode)
        StatusBadge(
          icon: Icons.science_outlined,
          label: l10n.demoMode,
          color: SenvoriColors.warning,
        ),
      StatusBadge(
        icon: conn.icon,
        label: conn.label,
        color: conn.color,
        semanticLabel: conn.label,
      ),
      Text(
        state.localTime,
        style: SenvoriType.mono(SenvoriColors.textSecondary),
      ),
      _ModeSwitcher(
        mode: state.mode,
        l10n: l10n,
        onChanged: onModeChanged,
        onDiagnostics: onOpenDiagnostics,
      ),
    ];

    if (wide) {
      return Row(
        children: [
          Expanded(child: unit),
          ...controls
              .expand((w) => [w, const SizedBox(width: SenvoriSpacing.md)])
              .toList()
            ..removeLast(),
        ],
      );
    }
    // Narrow: stack the unit label above a wrapping control row so nothing
    // overflows on phones and kiosk portrait displays.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        unit,
        const SizedBox(height: SenvoriSpacing.md),
        Wrap(
          spacing: SenvoriSpacing.sm,
          runSpacing: SenvoriSpacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: controls,
        ),
      ],
    );
  }
}

class _ModeSwitcher extends StatelessWidget {
  const _ModeSwitcher({
    required this.mode,
    required this.l10n,
    required this.onChanged,
    this.onDiagnostics,
  });
  final PlayerMode mode;
  final L10n l10n;
  final ValueChanged<PlayerMode> onChanged;
  final VoidCallback? onDiagnostics;

  @override
  Widget build(BuildContext context) {
    return SegmentedButton<PlayerMode>(
      segments: [
        ButtonSegment(
          value: PlayerMode.ambient,
          label: Text(l10n.modeAmbient),
          icon: const Icon(Icons.blur_on),
        ),
        ButtonSegment(
          value: PlayerMode.operational,
          label: Text(l10n.modeOperational),
          icon: const Icon(Icons.dashboard_outlined),
        ),
      ],
      selected: {
        mode == PlayerMode.diagnostics ? PlayerMode.operational : mode,
      },
      onSelectionChanged: (s) => onChanged(s.first),
      showSelectedIcon: false,
    );
  }
}

/// The hero: artwork surface + title/artist. Shared by both layouts.
class _Hero extends StatelessWidget {
  const _Hero({required this.state, required this.seed, required this.l10n});
  final NowPlayingViewState state;
  final String seed;
  final L10n l10n;

  @override
  Widget build(BuildContext context) {
    final current = state.current;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (current != null) ...[
          if (current.kind != null)
            Text(
              current.kind!.toUpperCase(),
              style: SenvoriType.label(SenvoriColors.accent),
            ),
          const SizedBox(height: SenvoriSpacing.md),
          Text(
            current.title,
            style: SenvoriType.hero(SenvoriColors.textPrimary),
          ),
          if (current.artist != null) ...[
            const SizedBox(height: SenvoriSpacing.sm),
            Text(
              current.artist!,
              style: SenvoriType.title(SenvoriColors.textSecondary),
            ),
          ],
          const SizedBox(height: SenvoriSpacing.xl),
          PlaybackProgress(position: state.position, duration: state.duration),
        ] else
          MessageState(
            icon: Icons.library_music_outlined,
            title: l10n.statusNoContent,
            detail: l10n.statusOfflineDetail,
          ),
      ],
    );
  }
}

/// A rounded artwork surface driven by the deterministic ambient field.
class _ArtworkSurface extends StatelessWidget {
  const _ArtworkSurface({required this.seed});
  final String seed;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(SenvoriRadii.lg),
        child: Stack(
          fit: StackFit.expand,
          children: [
            AmbientArtwork(seed: seed),
            Center(
              child: Icon(
                Icons.graphic_eq,
                size: 64,
                color: SenvoriColors.textPrimary.withValues(alpha: 0.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NextUp extends StatelessWidget {
  const _NextUp({required this.state, required this.l10n});
  final NowPlayingViewState state;
  final L10n l10n;

  @override
  Widget build(BuildContext context) {
    final next = state.next;
    return Container(
      padding: const EdgeInsets.all(SenvoriSpacing.md),
      decoration: BoxDecoration(
        color: SenvoriColors.surface1.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(SenvoriRadii.md),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.skip_next_outlined,
            color: SenvoriColors.textTertiary,
          ),
          const SizedBox(width: SenvoriSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.nowPlayingNext,
                  style: SenvoriType.label(SenvoriColors.textTertiary),
                ),
                const SizedBox(height: 2),
                Text(
                  next == null
                      ? l10n.nowPlayingNothingNext
                      : '${next.title}${next.artist != null ? ' · ${next.artist}' : ''}',
                  style: SenvoriType.body(SenvoriColors.textSecondary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _OperationalStrip extends StatelessWidget {
  const _OperationalStrip({required this.state, required this.l10n});
  final NowPlayingViewState state;
  final L10n l10n;

  @override
  Widget build(BuildContext context) {
    if (state.mode == PlayerMode.ambient) return const SizedBox.shrink();
    final s = StatusDescriptor.of(state.status, l10n);
    return Padding(
      padding: const EdgeInsets.only(top: SenvoriSpacing.md),
      child: Row(
        children: [
          StatusBadge(icon: s.icon, label: s.label, color: s.color),
          if (s.detail != null) ...[
            const SizedBox(width: SenvoriSpacing.md),
            Expanded(
              child: Text(
                s.detail!,
                style: SenvoriType.body(SenvoriColors.textTertiary),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _WideBody extends StatelessWidget {
  const _WideBody({
    required this.state,
    required this.l10n,
    required this.seed,
  });

  final NowPlayingViewState state;
  final L10n l10n;
  final String seed;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxHeight < 430;

        final details = Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _Hero(state: state, seed: seed, l10n: l10n),
            SizedBox(height: compact ? SenvoriSpacing.md : SenvoriSpacing.lg),
            _NextUp(state: state, l10n: l10n),
            _OperationalStrip(state: state, l10n: l10n),
          ],
        );

        return Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              flex: 5,
              child: Padding(
                padding: const EdgeInsets.only(right: SenvoriSpacing.xl),
                child: _ArtworkSurface(seed: seed),
              ),
            ),
            Expanded(
              flex: 6,
              child: compact ? SingleChildScrollView(child: details) : details,
            ),
          ],
        );
      },
    );
  }
}

class _NarrowBody extends StatelessWidget {
  const _NarrowBody({
    required this.state,
    required this.l10n,
    required this.seed,
  });
  final NowPlayingViewState state;
  final L10n l10n;
  final String seed;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _ArtworkSurface(seed: seed),
          const SizedBox(height: SenvoriSpacing.lg),
          _Hero(state: state, seed: seed, l10n: l10n),
          const SizedBox(height: SenvoriSpacing.lg),
          _NextUp(state: state, l10n: l10n),
          _OperationalStrip(state: state, l10n: l10n),
        ],
      ),
    );
  }
}
