/*
 * {{PROJECT_NAME}} — ThemeData mapping
 *
 * Token wiring: every colour, font and size in the app resolves through
 * [AppTokens] (lib/theme/tokens.dart), which is compiled from the project's
 * design-system/tokens/. Never hardcode a hex value or a raw size in a widget —
 * change the tokens, not the widget.
 *
 * This file mirrors what `tailwind.config.js` + `app/globals.css` do for the
 * web starter: it takes the token layer and exposes it to the framework's
 * theming API. The ColorScheme is built from explicit token values, not from
 * `ColorScheme.fromSeed` — a generated seed palette would not match
 * design-system/tokens/color.md.
 *
 * Cross-references:
 * - ColorScheme roles → design-system/tokens/color.md §Semantic Palette
 * - TextTheme → design-system/tokens/typography.md Type Scale table
 * - Spacing/radius → design-system/tokens/spacing.md Space Scale table
 * - Dark theme → color.md dark-mode palette; keep both themes token-driven
 * - Contrast → accessibility-guidelines.md §Color & Contrast; QA Agent audits
 *   the computed values used here
 */

import 'package:flutter/material.dart';

import 'tokens.dart';

/// Builds the app's [ThemeData] from [AppTokens].
abstract final class AppTheme {
  /// Light theme — the default. Values trace to design-system/tokens/.
  static ThemeData light() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppTokens.brandPrimary500,
      onPrimary: AppTokens.surfaceRaised,
      primaryContainer: AppTokens.brandPrimary100,
      onPrimaryContainer: AppTokens.brandPrimary900,
      secondary: AppTokens.brandPrimary700,
      onSecondary: AppTokens.surfaceRaised,
      error: AppTokens.error500,
      onError: AppTokens.surfaceRaised,
      surface: AppTokens.surface,
      onSurface: AppTokens.textPrimary,
      outline: AppTokens.border,
    );

    return _base(scheme);
  }

  /// Dark theme — same token names, dark-mode values from color.md.
  /// TODO: replace with the color.md dark palette once it is defined; the
  /// current values deliberately reuse the light tokens so the scaffold boots.
  static ThemeData dark() {
    const scheme = ColorScheme(
      brightness: Brightness.dark,
      primary: AppTokens.brandPrimary200,
      onPrimary: AppTokens.brandPrimary900,
      primaryContainer: AppTokens.brandPrimary700,
      onPrimaryContainer: AppTokens.brandPrimary50,
      secondary: AppTokens.brandPrimary200,
      onSecondary: AppTokens.neutral900,
      error: AppTokens.error500,
      onError: AppTokens.surfaceRaised,
      surface: AppTokens.neutral900,
      onSurface: AppTokens.neutral50,
      outline: AppTokens.neutral600,
    );

    return _base(scheme);
  }

  /// Everything the two themes share: type scale, shape, component defaults.
  ///
  /// Sub-themes are kept to the ones whose type names are stable across Flutter
  /// 3.x. If the project needs to override the app bar, note that the class
  /// passed to `ThemeData.appBarTheme` was renamed (`AppBarTheme` →
  /// `AppBarThemeData`) in a recent SDK — Material 3 already derives AppBar
  /// colours from the ColorScheme, so no override is needed for
  /// colour correctness.
  static ThemeData _base(ColorScheme scheme) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: scheme.surface,
      fontFamily: AppTokens.fontFamily,
      textTheme: _textTheme(scheme),
      dividerTheme: DividerThemeData(
        color: scheme.outline,
        thickness: 1,
        space: AppTokens.space4,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ButtonStyle(
          backgroundColor: WidgetStatePropertyAll<Color>(scheme.primary),
          foregroundColor: WidgetStatePropertyAll<Color>(scheme.onPrimary),
          padding: const WidgetStatePropertyAll<EdgeInsetsGeometry>(
            EdgeInsets.symmetric(
              horizontal: AppTokens.space6,
              vertical: AppTokens.space3,
            ),
          ),
          shape: const WidgetStatePropertyAll<OutlinedBorder>(
            RoundedRectangleBorder(
              borderRadius: BorderRadius.all(
                Radius.circular(AppTokens.radiusMd),
              ),
            ),
          ),
          textStyle: const WidgetStatePropertyAll<TextStyle>(
            TextStyle(
              fontFamily: AppTokens.fontFamily,
              fontSize: AppTokens.textBase,
              fontWeight: AppTokens.weightMedium,
            ),
          ),
        ),
      ),
    );
  }

  /// The type scale, mapped 1:1 from typography.md. Body sizes carry the
  /// 1.625 line-height; headings tighten (see typography.md).
  static TextTheme _textTheme(ColorScheme scheme) {
    return TextTheme(
      displayLarge: TextStyle(
        fontSize: AppTokens.text4xl,
        fontWeight: AppTokens.weightBold,
        height: 1.2,
        color: scheme.onSurface,
      ),
      displayMedium: TextStyle(
        fontSize: AppTokens.text3xl,
        fontWeight: AppTokens.weightBold,
        height: 1.2,
        color: scheme.onSurface,
      ),
      headlineLarge: TextStyle(
        fontSize: AppTokens.text2xl,
        fontWeight: AppTokens.weightBold,
        height: 1.25,
        color: scheme.onSurface,
      ),
      headlineMedium: TextStyle(
        fontSize: AppTokens.textXl,
        fontWeight: AppTokens.weightMedium,
        height: 1.3,
        color: scheme.onSurface,
      ),
      titleLarge: TextStyle(
        fontSize: AppTokens.textLg,
        fontWeight: AppTokens.weightMedium,
        height: 1.35,
        color: scheme.onSurface,
      ),
      bodyLarge: TextStyle(
        fontSize: AppTokens.textBase,
        fontWeight: AppTokens.weightRegular,
        height: AppTokens.lineHeightBody,
        color: scheme.onSurface,
      ),
      bodyMedium: TextStyle(
        fontSize: AppTokens.textSm,
        fontWeight: AppTokens.weightRegular,
        height: AppTokens.lineHeightBody,
        color: scheme.onSurface,
      ),
      bodySmall: TextStyle(
        fontSize: AppTokens.textXs,
        fontWeight: AppTokens.weightRegular,
        height: AppTokens.lineHeightBody,
        color: AppTokens.textSecondary,
      ),
      labelLarge: TextStyle(
        fontSize: AppTokens.textSm,
        fontWeight: AppTokens.weightMedium,
        color: scheme.onSurface,
      ),
    );
  }
}
