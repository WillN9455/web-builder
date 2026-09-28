/*
 * {{PROJECT_NAME}} — Design Tokens
 * Generated from design-system tokens.
 * All values must match the tokens defined in design-system/tokens/.
 *
 * Cross-references:
 * - Brand colors (primary 50..900) → design-system/tokens/color.md §Brand Palette — replace with user's brand colors before deploying
 * - Neutral palette → color.md §Neutral Palette (exact hex values)
 * - Semantic palette → color.md §Semantic Palette (WCAG AA contrast checked in color.md Validation Checklist)
 * - Typography scale → typography.md Type Scale table (Major Third 1.250 ratio; rem values converted to logical pixels at 16px base)
 * - Font family → typography.md font-family selection; the font must be bundled via the `fonts:` block in pubspec.yaml (Flutter has no CSS font stack)
 * - Spacing → spacing.md Space Scale table (4px base unit)
 * - Container widths → spacing.md Container Widths table
 * - Focus ring rules → accessibility-guidelines.md §Keyboard Accessibility + states/interaction.md focus state rules
 * - Body styling → typography.md font-size/body line-height 1.625; color.md neutral-800 text; neutral-50 background
 * - Screen-reader labels → accessibility-guidelines.md §Screen Reader Support (Semantics widget, not a CSS .sr-only utility)
 *
 * ============================================
 * DESIGN TOKENS — DO NOT MODIFY THESE MANUALLY
 * These are compiled from design-system/tokens/
 * Regenerate when design tokens change.
 * ============================================
 */

import 'package:flutter/material.dart';

/// Compile-time token values. This file is the ONLY place a colour literal or
/// raw size may appear; every widget reads a token from here (directly or via
/// `AppTheme`) — see README.md §Token wiring.
abstract final class AppTokens {
  // ---------------------------------------------------------------
  // Colors — Brand (ask user for brand colors)
  // ---------------------------------------------------------------
  static const Color brandPrimary50 = Color(0xFFEFF6FF);
  static const Color brandPrimary100 = Color(0xFFDBEAFE);
  static const Color brandPrimary200 = Color(0xFFBFDBFE);
  static const Color brandPrimary500 = Color(0xFF3B82F6);
  static const Color brandPrimary700 = Color(0xFF1D4ED8);
  static const Color brandPrimary900 = Color(0xFF1E3A8A);

  // Colors — Neutral
  static const Color neutral50 = Color(0xFFFAFAFA);
  static const Color neutral100 = Color(0xFFF5F5F5);
  static const Color neutral200 = Color(0xFFE5E5E5);
  static const Color neutral400 = Color(0xFF9CA3AF);
  static const Color neutral600 = Color(0xFF4B5563);
  static const Color neutral800 = Color(0xFF1F2937);
  static const Color neutral900 = Color(0xFF111827);

  // Colors — Semantic
  static const Color success500 = Color(0xFF059669);
  static const Color success700 = Color(0xFF047857);
  static const Color warning500 = Color(0xFFD97706);
  static const Color warning700 = Color(0xFFB45309);
  static const Color error500 = Color(0xFFDC2626);
  static const Color error700 = Color(0xFFB91C1C);
  static const Color info500 = Color(0xFF2563EB);
  static const Color info700 = Color(0xFF1D4ED8);

  // Colors — Semantic roles (the names widgets should reach for)
  static const Color textPrimary = neutral800;
  static const Color textSecondary = neutral600;
  static const Color textMuted = neutral400;
  static const Color surface = neutral50;
  static const Color surfaceRaised = Colors.white;
  static const Color border = neutral200;

  // ---------------------------------------------------------------
  // Typography (rem → logical px at a 16px base)
  // ---------------------------------------------------------------
  /// The chosen font family. Must match the `fonts:` family declared in
  /// pubspec.yaml and design-system/tokens/typography.md.
  static const String fontFamily = '{{PRIMARY_FONT}}';

  static const double textXs = 12.0; // 0.75rem
  static const double textSm = 14.0; // 0.875rem
  static const double textBase = 16.0; // 1rem
  static const double textLg = 20.0; // 1.25rem
  static const double textXl = 25.0; // 1.563rem
  static const double text2xl = 31.25; // 1.953rem
  static const double text3xl = 39.06; // 2.441rem
  static const double text4xl = 48.83; // 3.052rem

  // Font weights used by the type scale
  static const FontWeight weightRegular = FontWeight.w400;
  static const FontWeight weightMedium = FontWeight.w500;
  static const FontWeight weightBold = FontWeight.w700;

  /// Body line-height from globals.css (1.625) — line height in Flutter is a
  /// multiple of the font size, same unit as the web token.
  static const double lineHeightBody = 1.625;

  // ---------------------------------------------------------------
  // Spacing
  // ---------------------------------------------------------------
  static const double space1 = 4.0;
  static const double space2 = 8.0;
  static const double space3 = 12.0;
  static const double space4 = 16.0;
  static const double space6 = 24.0;
  static const double space8 = 32.0;
  static const double space12 = 48.0;
  static const double space16 = 64.0;

  // ---------------------------------------------------------------
  // Container widths / breakpoints
  // ---------------------------------------------------------------
  static const double containerSm = 640.0;
  static const double containerMd = 768.0;
  static const double containerLg = 1024.0;
  static const double containerXl = 1280.0;
  static const double container2xl = 1536.0;

  // ---------------------------------------------------------------
  // Focus ring (web: 2px solid brand-primary-500, 2px offset)
  // Native has no focus ring for touch; this drives focus-visible styling on
  // desktop/web targets and the focus indicator used in accessibility tests.
  // ---------------------------------------------------------------
  static const double focusRingWidth = 2.0;
  static const double focusRingOffset = 2.0;
  static const Color focusRingColor = brandPrimary500;

  // ---------------------------------------------------------------
  // Shape / radius (Material 3 defaults, token-driven)
  // ---------------------------------------------------------------
  static const double radiusSm = 4.0;
  static const double radiusMd = 8.0;
  static const double radiusLg = 16.0;
  static const double radiusFull = 999.0;
}
