import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'tokens.dart';

/// Deterministic ambient artwork (Sprint 09 · §26). When a content item has no
/// real artwork, we synthesise a calm abstract composition. The composition is
/// a pure function of a seed (assetId + planHash + visual version), so the same
/// content always looks the same — no real randomness, no remote images.
///
/// It is cheap: a handful of radial gradients painted once per content change.
/// An optional [phase] in [0,1] lets an ambient animation drift the field very
/// slowly; passing a constant (reduce-motion) yields a still image.
final class AmbientArtwork extends StatelessWidget {
  const AmbientArtwork({
    super.key,
    required this.seed,
    this.phase = 0,
    this.dimmed = false,
  });

  final String seed;
  final double phase;
  final bool dimmed;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _AmbientPainter(seed: seed, phase: phase, dimmed: dimmed),
      isComplex: true,
      willChange: phase != 0,
      child: const SizedBox.expand(),
    );
  }
}

class _AmbientPainter extends CustomPainter {
  _AmbientPainter({
    required this.seed,
    required this.phase,
    required this.dimmed,
  });

  final String seed;
  final double phase;
  final bool dimmed;

  @override
  void paint(Canvas canvas, Size size) {
    final rng = _SeededRandom(seed.hashCode);
    final rect = Offset.zero & size;

    // Base wash.
    canvas.drawRect(rect, Paint()..color = SenvoriColors.surface0);

    // Derive a small palette from the seed, biased toward the brand accent so
    // every generated field still reads as "Senvori".
    final baseHue = (rng.nextDouble() * 360);
    final blobs = 3 + rng.nextInt(2);
    for (var i = 0; i < blobs; i++) {
      final hue = (baseHue + i * 47) % 360;
      final color = HSLColor.fromAHSL(1.0, hue, 0.35, 0.28).toColor();
      final accented = Color.lerp(
        color,
        SenvoriColors.accent,
        i == 0 ? 0.35 : 0.12,
      )!;
      final cx = size.width * (0.2 + rng.nextDouble() * 0.6);
      final cy = size.height * (0.2 + rng.nextDouble() * 0.6);
      final drift =
          math.sin((phase * 2 * math.pi) + i) * size.shortestSide * 0.03;
      final radius = size.shortestSide * (0.35 + rng.nextDouble() * 0.35);
      final paint = Paint()
        ..shader =
            RadialGradient(
              colors: [
                accented.withValues(alpha: dimmed ? 0.35 : 0.6),
                accented.withValues(alpha: 0.0),
              ],
            ).createShader(
              Rect.fromCircle(
                center: Offset(cx + drift, cy - drift),
                radius: radius,
              ),
            );
      canvas.drawCircle(Offset(cx + drift, cy - drift), radius, paint);
    }

    // Subtle top-down vignette to keep foreground text legible.
    canvas.drawRect(
      rect,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0x00000000), Color(0x99000000)],
        ).createShader(rect),
    );
  }

  @override
  bool shouldRepaint(covariant _AmbientPainter old) =>
      old.seed != seed || old.phase != phase || old.dimmed != dimmed;
}

/// A tiny, deterministic LCG so artwork never depends on `Random()` global
/// state and is identical across runs and platforms for the same seed.
final class _SeededRandom {
  _SeededRandom(int seed) : _state = (seed ^ 0x9E3779B9) & 0x7FFFFFFF;
  int _state;

  int _next() {
    _state = (_state * 1103515245 + 12345) & 0x7FFFFFFF;
    return _state;
  }

  double nextDouble() => _next() / 0x7FFFFFFF;
  int nextInt(int max) => _next() % max;
}
