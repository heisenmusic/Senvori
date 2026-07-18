import 'package:flutter/material.dart';

/// Senvori Player design tokens (Sprint 09 · §29). A restrained, premium
/// palette: deep near-black surfaces, warm off-white text, a single confident
/// accent, and semantic operational colours. Deliberately *not* the generic
/// purple-blue startup gradient or a music-app clone.
abstract final class SenvoriColors {
  // Surfaces — layered near-blacks with a faint warm cast.
  static const surface0 = Color(0xFF0A0B0E); // deepest background
  static const surface1 = Color(0xFF12141A);
  static const surface2 = Color(0xFF1A1D26);
  static const surface3 = Color(0xFF242833);

  // Text — warm neutrals for calm legibility on dark.
  static const textPrimary = Color(0xFFF4F1EA);
  static const textSecondary = Color(0xFFB6B2A8);
  static const textTertiary = Color(0xFF7A7770);

  // Brand accent — a warm amber/gold, used sparingly for emphasis and motion.
  static const accent = Color(0xFFE0A85B);
  static const accentSoft = Color(0xFF8C6A3A);

  // Operational semantics — never rely on colour alone (paired with icon/text).
  static const online = Color(0xFF6FCF97);
  static const offline = Color(0xFF9AA0AA);
  static const syncing = Color(0xFF63A6E0);
  static const warning = Color(0xFFE0B65B);
  static const degraded = Color(0xFFE08A5B);
  static const emergency = Color(0xFFE05B6A);

  // Light-theme counterparts for daytime desktop/demo use.
  static const lightSurface0 = Color(0xFFF6F4EF);
  static const lightSurface1 = Color(0xFFFFFFFF);
  static const lightSurface2 = Color(0xFFEDEAE2);
  static const lightTextPrimary = Color(0xFF1A1D26);
  static const lightTextSecondary = Color(0xFF55524B);
}

abstract final class SenvoriSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 40.0;
  static const xxl = 64.0;
}

abstract final class SenvoriRadii {
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 28.0;
  static const pill = 999.0;
}

abstract final class SenvoriMotion {
  /// Fast, previsible durations. Ambient loops are separate and low-cost.
  static const fast = Duration(milliseconds: 180);
  static const normal = Duration(milliseconds: 320);
  static const slow = Duration(milliseconds: 640);
  static const ambient = Duration(seconds: 8);

  static const easeStandard = Cubic(0.2, 0.0, 0.0, 1.0);
  static const easeEmphasized = Cubic(0.2, 0.0, 0.0, 1.0);
}

abstract final class SenvoriType {
  static const displayFamily = null; // system default; brand font is a future
  static TextStyle hero(Color c) => TextStyle(
    fontSize: 44,
    height: 1.05,
    fontWeight: FontWeight.w600,
    letterSpacing: -0.5,
    color: c,
  );
  static TextStyle title(Color c) => TextStyle(
    fontSize: 24,
    height: 1.1,
    fontWeight: FontWeight.w600,
    color: c,
  );
  static TextStyle subtitle(Color c) => TextStyle(
    fontSize: 17,
    height: 1.2,
    fontWeight: FontWeight.w500,
    color: c,
  );
  static TextStyle body(Color c) =>
      TextStyle(fontSize: 15, height: 1.35, color: c);
  static TextStyle label(Color c) => TextStyle(
    fontSize: 12,
    height: 1.2,
    fontWeight: FontWeight.w600,
    letterSpacing: 0.8,
    color: c,
  );
  static TextStyle mono(Color c) =>
      TextStyle(fontSize: 13, height: 1.35, fontFamily: 'monospace', color: c);
}
