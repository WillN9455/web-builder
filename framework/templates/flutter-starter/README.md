# flutter-starter

Scaffoldable Flutter (Dart) + Material 3 starter for **native iOS/Android
apps**. The Build stage's Code Agents copy this tree as the base of a new
project — see [`../docs/template-selection.md`](../docs/template-selection.md)
and [`../../build/config/config-rules.md`](../../build/config/config-rules.md)
for the selection rules.

Use this starter when the deliverable is a **native app**, not a web app. It
exists so a Code Agent on a mobile project has a native base to scaffold from
instead of defaulting to `nextjs-starter/`.

## What's wired

- `lib/theme/tokens.dart` — design tokens compiled from the project's
  `design-system/tokens/` (brand / neutral / semantic palettes, type scale,
  spacing, container widths, focus ring). Regenerate when tokens change; never
  edit the token block by hand.
- `lib/theme/app_theme.dart` — maps the token layer into `ThemeData`
  (`ColorScheme`, `TextTheme`, button/divider defaults). The
  `ColorScheme` is built from explicit token values, **not**
  `ColorScheme.fromSeed` — a generated seed palette would not match
  `design-system/tokens/color.md`.
- `lib/main.dart` — placeholder copy (`{{PROJECT_NAME}}`, `{{DESCRIPTION}}`),
  header landmark (`Semantics(header: true)`), `AppBar` → body order.
- `pubspec.yaml` — package metadata, dependencies, the bundled-font block for
  `{{PRIMARY_FONT}}`. Intended SDK pin: **Flutter 3.47 (provisional)** — the
  constraints are loose until the pin is confirmed (see §Scaffold steps).
- `analysis_options.yaml` — `flutter_lints` plus the strict analyzer settings
  the Build stage enforces (`strict-casts`, `strict-raw-types`).
- `test/widget_test.dart` — smoke test: app boots, landmark order holds, theme
  resolves to token values.
- `.env.example` — build-time configuration template. Flutter reads values via
  `--dart-define`, never from a runtime file, and **the client binary is
  public**: no secrets are baked into it (see §Secrets).

## Token wiring

The same rule the web starter enforces in `tailwind.config.js` /
`app/globals.css` applies here:

> **Every colour, font and size comes from the project's
> `design-system/tokens/` files. No hex value is hardcoded anywhere.**

`lib/theme/tokens.dart` is the only file that may contain a colour literal or a
raw size — it *is* the compiled token layer, the Flutter counterpart of the
`app/globals.css` custom-property block. Widgets reach tokens through
`Theme.of(context)` (mapped by `lib/theme/app_theme.dart`) or `AppTokens`.

| Token source | Flutter consumer |
|---|---|
| `design-system/tokens/color.md` | `lib/theme/tokens.dart` — brand/neutral/semantic palettes; `color.md` §Validation Checklist requires WCAG AA contrast on the semantic values |
| `design-system/tokens/typography.md` | `lib/theme/tokens.dart` type scale + `pubspec.yaml` `fonts:` block (Flutter has no CSS font stack, so the family must be bundled) |
| `design-system/tokens/spacing.md` | `lib/theme/tokens.dart` space scale and container widths (used as breakpoints) |
| `design-system/states/interaction.md`, `framework/design/skills/accessibility-guidelines.md` | `AppTokens.focusRing*`, `Semantics` labels and the accessibility tests — there is no CSS `.sr-only` utility on native |

## Scaffold steps

1. Copy this folder into a new branch as the project root.
2. **Bootstrap the platform folders.** `android/`, `ios/`, `macos/`, `web/`,
   `linux/` and `windows/` are *generated* code and are deliberately not in this
   template. Run `flutter create .` in the project root to generate them — it
   fills in the missing platform scaffolding and leaves `lib/`, `test/` and
   `pubspec.yaml` alone. Check `git status` before continuing: `flutter create`
   also rewrites `pubspec.yaml`'s comment block, so restore any comment you want
   to keep. Pin the toolchain you ran it with (`flutter --version`) and record
   it in the project's README — the intended pin is **Flutter 3.47
   (provisional)**, tighten `pubspec.yaml`'s `flutter:` constraint to match once
   the pin is confirmed.
3. Replace every `{{PLACEHOLDER}}` token (`{{PROJECT_NAME}}`,
   `{{PROJECT_NAME_SLUG}}`, `{{PRIMARY_FONT}}`, `{{DESCRIPTION}}`) — including
   `name:` in `pubspec.yaml` and the `package:` import prefix in
   `test/widget_test.dart`, which must stay a valid Dart package identifier
   (lowercase, underscores).
4. All colour values come from the project's `design-system/tokens/color.md`,
   typography from `typography.md`, spacing from `spacing.md`.
5. `flutter pub get && flutter run` to verify the scaffold boots before any
   feature work starts; `flutter analyze && flutter test` before the task is
   called complete.

## Secrets

A Flutter app is a **client**: anything compiled into the binary is readable by
anyone who installs it. Build-time values go in via `--dart-define` and are read
with `String.fromEnvironment` — see `.env.example` for the allowed list. Service
credentials, database passwords and admin keys never ship in the app; put
privileged calls behind a server-side BFF (see
[`../../build/config/config-rules.md`](../../build/config/config-rules.md)
§API Communication).

## Roadmap starters

`vue-nuxt-starter/` and `sveltekit-starter/` are planned but not in the tree —
the manifest's `templates` key promises this folder and `nextjs-starter/`.
