// Smoke test for the {{PROJECT_NAME}} scaffold.
//
// Test file organization follows ../../../qa/skills/testing-guidelines.md
// §Test File Organization: `test/` mirrors `lib/`, one test file per source
// file, names describe behaviour. Replace this with the project's real tests —
// every test must trace to a PRD §8 user story (#N).
//
// Run: flutter test

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:{{PROJECT_NAME_SLUG}}/main.dart';
import 'package:{{PROJECT_NAME_SLUG}}/theme/app_theme.dart';
import 'package:{{PROJECT_NAME_SLUG}}/theme/tokens.dart';

void main() {
  testWidgets('app boots and renders the landing header', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const App());

    // The scaffold must render without throwing, with a single header landmark.
    expect(find.byType(MaterialApp), findsOneWidget);
    // The placeholder renders literally until scaffold-fill replaces it.
    expect(find.text('{{PROJECT_NAME}}'), findsWidgets);
  });

  testWidgets('landing screen keeps the AppBar → body landmark order', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const App());

    expect(find.byType(AppBar), findsOneWidget);
    expect(find.byType(SingleChildScrollView), findsOneWidget);
  });

  test('theme is built from tokens, not from literal values', () {
    final ThemeData theme = AppTheme.light();

    expect(theme.colorScheme.primary, AppTokens.brandPrimary500);
    expect(theme.scaffoldBackgroundColor, AppTokens.surface);
    expect(theme.textTheme.bodyLarge?.fontSize, AppTokens.textBase);
    expect(theme.textTheme.bodyLarge?.height, AppTokens.lineHeightBody);
    expect(theme.textTheme.bodyLarge?.fontFamily, AppTokens.fontFamily);
  });
}
