# Test Rules (rules in force)

Edits from the QA tab Rules half write back to this file. The QA Agent reads
it on every run. Test-writing mechanics live in `../skills/testing-guidelines.md`;
this file holds the configuration and policy.

## Test framework config

- Runner: Playwright (only tool for now — screenshots are first-class, stored under `qa-evidence/`)
- Browsers: chromium (default), firefox, webkit on demand; mobile projects per `../skills/testing-guidelines.md` §4
- Headed: `--headed=false` default · headless in CI, headed on demand
- Trace: `trace=on-first-retry` · full trace on flake investigation
- Retries: 2 in CI · 0 locally
- Base URL: the QA env URL after Build deploys (per `../config` — see build-rules.md §Environments)
- Config lives at `framework/qa/playwright.config.ts` in the project (copied into the project workspace when the QA harness is scaffolded)

## Rules in force

- **A11y** — WCAG 2.1 AA · axe-core on every page; a11y failures block deploy (no exceptions)
- **Fidelity** — pixel-snap critical screens against the design spec (`../../design/skills/ui-best-practices.md` + `feature-fidelity.md`)
- **Coverage** — every story gets ≥ 1 happy-path + 1 error-path test (full bar per `../skills/testing-guidelines.md` §2)
- **Screenshots** — per test step; the 3 most recent runs kept; pass confirmations and fail evidence shots both kept
- **Evidence rules** — see `../skills/testing-guidelines.md` §8 (screenshots first-class)

## Flake & blocking policy

- Pass rate = Passed / (Passed + Failed + Blocked). **Flaky runs are excluded** from the numerator and tracked separately for quarantine
- A story failing at QA routes to the Build rework queue with evidence attached; fix → re-PR → re-QA
- Blocked / skipped runs need a stated reason; "awaiting data fix" does not block deploy, unresolved failures do
- Flaky tests: 3 runs, review for quarantine — do not delete silently

## Results by dimension

Report every QA run across three dimensions:

- **Functional** — stories passed / failed
- **A11y** — WCAG 2.1 AA, axe-core clean per page
- **Feature-fidelity** — pixel-snap critical screens vs the design spec

## Per-agent QA guidelines

Overrides for the QA Agent go here. The QA tab Rules half appends/edits these
blocks.