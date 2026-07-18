import 'package:flutter/material.dart';

import '../../bootstrap/boot_phase.dart';
import '../../design_system/ambient_artwork.dart';
import '../../design_system/tokens.dart';
import '../../l10n/app_localizations.dart';

/// An elegant, honest boot screen (Sprint 09 · §10). It shows *real* progress
/// through the bootstrap phases — never an infinite fake spinner, never a white
/// screen — with calm, operator-friendly copy (no technical jargon).
final class BootScreen extends StatelessWidget {
  const BootScreen({super.key, required this.progress});
  final BootProgress progress;

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    final label = _label(progress.phase, l10n);
    return Scaffold(
      backgroundColor: SenvoriColors.surface0,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const AmbientArtwork(seed: 'senvori-boot', dimmed: true),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(SenvoriSpacing.xxl),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Senvori',
                    style: SenvoriType.hero(SenvoriColors.textPrimary),
                  ),
                  const SizedBox(height: SenvoriSpacing.sm),
                  Text(
                    label,
                    style: SenvoriType.subtitle(SenvoriColors.textSecondary),
                  ),
                  const SizedBox(height: SenvoriSpacing.lg),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(SenvoriRadii.pill),
                    child: LinearProgressIndicator(
                      value: progress.fraction,
                      minHeight: 4,
                      backgroundColor: SenvoriColors.surface2,
                      valueColor: const AlwaysStoppedAnimation(
                        SenvoriColors.accent,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _label(BootPhase phase, L10n l10n) =>
      switch (phase.messageKey) {
        'bootPreparing' => l10n.bootPreparing,
        'bootLoadingConfig' => l10n.bootLoadingConfig,
        'bootValidatingContent' => l10n.bootValidatingContent,
        'bootPreparingSchedule' => l10n.bootPreparingSchedule,
        'bootReady' => l10n.bootReady,
        _ => l10n.bootPreparing,
      };
}
