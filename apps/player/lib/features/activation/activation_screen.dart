import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../design_system/ambient_artwork.dart';
import '../../design_system/components.dart';
import '../../design_system/tokens.dart';
import '../../l10n/app_localizations.dart';
import 'activation.dart';

/// Premium activation experience (Sprint 09 · §12). Explains the process, shows
/// the code legibly, allows copy, and handles waiting/expiry/error. It never
/// leaks tokens — only the short pairing code is shown.
final class ActivationScreen extends StatelessWidget {
  const ActivationScreen({
    super.key,
    required this.phase,
    required this.code,
    required this.onRetry,
    this.errorMessage,
  });

  final ActivationPhase phase;
  final ActivationCode? code;
  final VoidCallback onRetry;
  final String? errorMessage;

  @override
  Widget build(BuildContext context) {
    final l10n = L10n.of(context);
    return Scaffold(
      backgroundColor: SenvoriColors.surface0,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const AmbientArtwork(seed: 'senvori-activation', dimmed: true),
          SafeArea(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 520),
                child: Padding(
                  padding: const EdgeInsets.all(SenvoriSpacing.xl),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        l10n.activationTitle,
                        style: SenvoriType.title(SenvoriColors.textPrimary),
                      ),
                      const SizedBox(height: SenvoriSpacing.sm),
                      Text(
                        l10n.activationUnlinked,
                        style: SenvoriType.body(SenvoriColors.textSecondary),
                      ),
                      const SizedBox(height: SenvoriSpacing.xl),
                      if (phase == ActivationPhase.error)
                        MessageState(
                          icon: Icons.error_outline,
                          title: errorMessage ?? l10n.errorActivationInvalid,
                          action: FilledButton(
                            onPressed: onRetry,
                            child: Text(l10n.activationRetry),
                          ),
                        )
                      else ...[
                        _CodeCard(code: code, l10n: l10n),
                        const SizedBox(height: SenvoriSpacing.lg),
                        Text(
                          l10n.activationInstruction,
                          textAlign: TextAlign.center,
                          style: SenvoriType.body(SenvoriColors.textSecondary),
                        ),
                        const SizedBox(height: SenvoriSpacing.lg),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                            const SizedBox(width: SenvoriSpacing.md),
                            Text(
                              l10n.activationWaiting,
                              style: SenvoriType.label(
                                SenvoriColors.textTertiary,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CodeCard extends StatelessWidget {
  const _CodeCard({required this.code, required this.l10n});
  final ActivationCode? code;
  final L10n l10n;

  @override
  Widget build(BuildContext context) {
    final display = code?.display ?? '········';
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: SenvoriSpacing.xl,
        horizontal: SenvoriSpacing.lg,
      ),
      decoration: BoxDecoration(
        color: SenvoriColors.surface1.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(SenvoriRadii.lg),
        border: Border.all(
          color: SenvoriColors.accentSoft.withValues(alpha: 0.5),
        ),
      ),
      child: Column(
        children: [
          SelectableText(
            display,
            style: TextStyle(
              fontSize: 40,
              fontWeight: FontWeight.w700,
              letterSpacing: 6,
              color: SenvoriColors.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          const SizedBox(height: SenvoriSpacing.md),
          TextButton.icon(
            onPressed: code == null
                ? null
                : () => Clipboard.setData(ClipboardData(text: code!.code)),
            icon: const Icon(Icons.copy, size: 16),
            label: Text(l10n.activationCopyCode),
          ),
        ],
      ),
    );
  }
}
