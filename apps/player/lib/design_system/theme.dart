import 'package:flutter/material.dart';

import 'tokens.dart';

/// Builds the Player's dark and light themes from the design tokens. The Player
/// is dark-first (it lives on always-on displays), with a light theme available
/// for daytime desktop/demo review.
abstract final class SenvoriTheme {
  static ThemeData dark() {
    final scheme = const ColorScheme.dark(
      surface: SenvoriColors.surface0,
      primary: SenvoriColors.accent,
      secondary: SenvoriColors.accentSoft,
      error: SenvoriColors.emergency,
    );
    return _base(scheme, SenvoriColors.textPrimary, SenvoriColors.surface0);
  }

  static ThemeData light() {
    final scheme = const ColorScheme.light(
      surface: SenvoriColors.lightSurface0,
      primary: SenvoriColors.accentSoft,
      secondary: SenvoriColors.accent,
      error: SenvoriColors.emergency,
    );
    return _base(
      scheme,
      SenvoriColors.lightTextPrimary,
      SenvoriColors.lightSurface0,
    );
  }

  static ThemeData _base(ColorScheme scheme, Color text, Color bg) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: bg,
      splashFactory: InkSparkle.splashFactory,
      textTheme: TextTheme(
        displayLarge: SenvoriType.hero(text),
        titleLarge: SenvoriType.title(text),
        titleMedium: SenvoriType.subtitle(text),
        bodyMedium: SenvoriType.body(text),
        labelSmall: SenvoriType.label(text),
      ),
      visualDensity: VisualDensity.comfortable,
    );
  }
}
