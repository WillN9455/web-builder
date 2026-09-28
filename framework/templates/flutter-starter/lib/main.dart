// {{PROJECT_NAME}} — app entry point.
//
// This is the landing screen. Replace the placeholder copy with the project's
// PRD §1 feature summary and keep the landmark structure (app bar → header →
// body) — accessibility-guidelines.md §Semantic Structure requires a single
// per-screen header and a logical reading order.
//
// Placeholders are wrapped in string literals so the scaffold compiles as-is
// before token replacement (the same convention the Next.js starter uses).
//
// Token wiring: no colour, font size or spacing literal may appear in this
// file. Everything resolves through theme/ (lib/theme/tokens.dart +
// lib/theme/app_theme.dart), which is compiled from the project's
// design-system/tokens/. Use `Theme.of(context).textTheme.*` and
// `AppTokens.space*` — never `Color(0x...)`.
//
// TODO: rename `App` to `<ProjectName>App` when filling in the tokens
// TODO: replace {{PROJECT_NAME}} with the actual project name
// TODO: replace {{DESCRIPTION}} with the one-sentence problem statement (PRD §2)
// TODO: replace {{PRIMARY_FONT}} in lib/theme/tokens.dart and bundle the font
//       via the `fonts:` block in pubspec.yaml

import 'package:flutter/material.dart';

import 'theme/app_theme.dart';
import 'theme/tokens.dart';

void main() {
  runApp(const App());
}

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '{{PROJECT_NAME}}',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      home: const HomeScreen(),
    );
  }
}

/// Landing screen. Replace the placeholder copy with the project's own
/// feature summary; keep the AppBar → header → body landmark order.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('{{PROJECT_NAME}}')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppTokens.space6),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              // Screen header — Semantics(header: true) is the native
              // equivalent of a single <h1> per page.
              Semantics(
                header: true,
                child: Text(
                  '{{PROJECT_NAME}}',
                  style: text.headlineLarge,
                ),
              ),
              const SizedBox(height: AppTokens.space4),
              Text(
                '{{DESCRIPTION}}',
                style: text.bodyLarge,
              ),
              const SizedBox(height: AppTokens.space8),
              Text(
                'Scaffolded from framework/templates/flutter-starter/ — replace '
                'the placeholder tokens per the template selection rules '
                '(framework/templates/docs/template-selection.md) before '
                'shipping.',
                style: text.bodySmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
