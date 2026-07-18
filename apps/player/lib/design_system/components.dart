import 'package:flutter/material.dart';

import 'tokens.dart';

/// Reusable Player components (Sprint 09 · §29). Each conveys operational state
/// with an icon + text + semantics, never colour alone (§33, §44).

/// A pill badge with an icon and label, used for connectivity/sync/status.
final class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.icon,
    required this.label,
    required this.color,
    this.semanticLabel,
  });

  final IconData icon;
  final String label;
  final Color color;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel ?? label,
      container: true,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: SenvoriSpacing.md,
          vertical: SenvoriSpacing.sm,
        ),
        decoration: BoxDecoration(
          color: SenvoriColors.surface2.withValues(alpha: 0.7),
          borderRadius: BorderRadius.circular(SenvoriRadii.pill),
          border: Border.all(color: color.withValues(alpha: 0.4)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: SenvoriSpacing.sm),
            Text(label, style: SenvoriType.label(SenvoriColors.textSecondary)),
          ],
        ),
      ),
    );
  }
}

/// A slim linear progress bar with a soft accent fill. Progress is exposed to
/// screen readers via [Semantics.value].
final class PlaybackProgress extends StatelessWidget {
  const PlaybackProgress({
    super.key,
    required this.position,
    required this.duration,
  });

  final Duration position;
  final Duration duration;

  @override
  Widget build(BuildContext context) {
    final total = duration.inMilliseconds;
    final value = total <= 0
        ? 0.0
        : (position.inMilliseconds / total).clamp(0.0, 1.0);
    return Semantics(
      label: 'Playback progress',
      value: '${(value * 100).round()}%',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(SenvoriRadii.pill),
            child: LinearProgressIndicator(
              value: value,
              minHeight: 4,
              backgroundColor: SenvoriColors.surface3,
              valueColor: const AlwaysStoppedAnimation(SenvoriColors.accent),
            ),
          ),
          const SizedBox(height: SenvoriSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _fmt(position),
                style: SenvoriType.mono(SenvoriColors.textTertiary),
              ),
              Text(
                _fmt(duration),
                style: SenvoriType.mono(SenvoriColors.textTertiary),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _fmt(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

/// A full-width emergency banner (Sprint 09 · §23). Clear but not grotesque.
final class EmergencyBanner extends StatelessWidget {
  const EmergencyBanner({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: message,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(
          horizontal: SenvoriSpacing.lg,
          vertical: SenvoriSpacing.md,
        ),
        decoration: BoxDecoration(
          color: SenvoriColors.emergency.withValues(alpha: 0.16),
          border: const Border(
            bottom: BorderSide(color: SenvoriColors.emergency, width: 2),
          ),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.warning_amber_rounded,
              color: SenvoriColors.emergency,
            ),
            const SizedBox(width: SenvoriSpacing.md),
            Expanded(
              child: Text(
                message,
                style: SenvoriType.subtitle(SenvoriColors.textPrimary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A labelled key/value row for diagnostics.
final class DiagnosticRow extends StatelessWidget {
  const DiagnosticRow({super.key, required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: SenvoriSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 180,
            child: Text(
              label,
              style: SenvoriType.label(SenvoriColors.textTertiary),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: SenvoriType.mono(SenvoriColors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

/// A calm empty/error placeholder.
final class MessageState extends StatelessWidget {
  const MessageState({
    super.key,
    required this.icon,
    required this.title,
    this.detail,
    this.action,
  });
  final IconData icon;
  final String title;
  final String? detail;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(SenvoriSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 48, color: SenvoriColors.textTertiary),
            const SizedBox(height: SenvoriSpacing.lg),
            Text(
              title,
              textAlign: TextAlign.center,
              style: SenvoriType.title(SenvoriColors.textPrimary),
            ),
            if (detail != null) ...[
              const SizedBox(height: SenvoriSpacing.sm),
              Text(
                detail!,
                textAlign: TextAlign.center,
                style: SenvoriType.body(SenvoriColors.textSecondary),
              ),
            ],
            if (action != null) ...[
              const SizedBox(height: SenvoriSpacing.lg),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
