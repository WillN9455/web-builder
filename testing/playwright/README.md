# Playwright UI Testing

Automated UI test patterns for validating that implemented features match the PRD and design spec.

## Test File Organization

```
testing/playwright/
├── README.md              /* This file */
├── setup.ts               /* Browser context, auth fixtures, global config */
├── helpers/               /* Shared test utilities */
│   ├── form.ts            /* Fill forms, submit, assert success/error */
│   ├── navigation.ts      /* Navigate, verify URL, check active nav */
│   └── accessibility.ts   /* WCAG audit helpers */
├── features/              /* Tests organized by feature (from PRD) */
│   └── <feature-name>/
│       ├── e2e.spec.ts    /* End-to-end user flow tests */
│       ├── a11y.spec.ts   /* Accessibility-specific tests */
│       └── states.spec.ts /* Component state tests (error, loading, etc.) */
└── reports/               /* Test output (gitignored) */
```

## Test Writing Rules

### From Requirements

Every test must trace back to a PRD requirement or user story — the test comment explicitly references which PRD section:

```ts
// PRD Section 8, User Story #3: As a small business owner, I want to create a project so that I can organize my work
test('should allow creating a new project', async ({ page }) => {
  // ...
});
```

### Tracing test coverage to design files

| Test category | Design file(s) it validates | State doc referenced |
|---------------|---------------------------|---------------------|
| Happy path (feature e2e) | `design-system/components/<component>.md` (props, variants, states table) | — |
| Error paths | `states/error.md` (error banner patterns, recovery actions); `components/<component>.md` error boundary spec | `error.md` |
| Edge cases | `states/empty.md` (empty state structure), `states/loading.md` (skeleton patterns) | `empty.md`, `loading.md` |
| Keyboard nav | `accessibility-guidelines.md` §Keyboard Accessibility; `states/interaction.md` focus rules | `interaction.md` |
| Accessibility | `accessibility-guidelines.md` (§Color & Contrast, §Screen Reader Support, §Testing Requirements) + each component's accessibility section | All state docs (required states tables) |
| Responsive | `components/<component>.md` breakpoint specs; `general-best-practices.md` mobile-first breakpoints (375px, 768px, 1024px, 1440px) | — |

### Required Test Coverage Per Feature

| Category | What to Test | Minimum | Design file reference |
|----------|-------------|---------|----------------------|
| Happy path | Core user flow works end-to-end | 1 test per PRD §8 User Story | Component spec + state doc for the main interaction |
| Error paths | API fails, validation fails, network timeout | At least 1 error path per form/API | `states/error.md` testing requirements; `components/form-input.md` error variant |
| Edge cases | Empty states, long text, small screens, slow connections | 1 edge case test minimum | `states/empty.md`; `states/loading.md` timing thresholds |
| Keyboard nav | All interactive elements reachable via keyboard | Every user flow | `accessibility-guidelines.md` §Keyboard Accessibility; `states/interaction.md` focus rules |
| Accessibility | WCAG AA compliance on every page | Per-page a11y test | Each component's accessibility section + state required states table |
| Responsive | Layout at all breakpoints (375px, 768px, 1024px, 1440px) | At least mobile + desktop | Component spec responsive notes; general-best-practices.md breakpoints |

### Test Naming Convention

```
test.describe('<Feature Name>', () => {
  test('should <verb> <expected outcome> when <condition>', async ({ page }) => { ... });
});
```

Verbs: `create`, `update`, `delete`, `navigate`, `validate`, `display`, `submit`, `filter`

### Example Test Suite Structure

```ts
import { test, expect } from '@playwright/test';

test.describe('Project Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects');
  });

  // Happy path
  test('should create a project when all fields are valid', async ({ page }) => {
    await page.click('[data-testid="new-project-btn"]');
    await page.fill('[data-testid="project-name"]', 'My Project');
    await page.fill('[data-testid="project-description"]', 'A test project');
    await page.click('[data-testid="submit-btn"]');
    await expect(page.locator('[data-testid="success-banner"]')).toBeVisible();
  });

  // Error path — validation
  test('should show error when project name is empty', async ({ page }) => {
    await page.click('[data-testid="new-project-btn"]');
    await page.fill('[data-testid="project-description"]', 'A description');
    await page.click('[data-testid="submit-btn"]');
    await expect(page.locator('[data-testid="validation-error"]')).toBeVisible();
  });

  // Error path — API failure
  test('should show error banner when project creation fails', async ({ page, request }) => {
    await page.route('/api/projects', route => route.fulfill({ status: 500 }));
    await page.click('[data-testid="new-project-btn"]');
    await page.fill('[data-testid="project-name"]', 'My Project');
    await page.click('[data-testid="submit-btn"]');
    await expect(page.locator('[data-testid="error-banner"]')).toBeVisible();
  });

  // Edge case — long text
  test('should handle project names exceeding container width', async ({ page }) => {
    const longName = 'A'.repeat(200);
    await page.fill('[data-testid="project-name"]', longName);
    await expect(page.locator('[data-testid="project-name"]')).toHaveCSS('overflow', 'hidden');
  });

  // Keyboard navigation
  test('should be navigable via keyboard', async ({ page }) => {
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-testid="new-project-btn"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-testid="project-name"]')).toBeFocused();
  });

  // Responsive — mobile
  test.use({ viewport: { width: 375, height: 812 } });
  test('should display the creation form on mobile', async ({ page }) => {
    await expect(page.locator('[data-testid="project-name"]')).toBeVisible();
  });
});
```

## Custom Fixtures (setup.ts)

```ts
import { test as base } from '@playwright/test';
import { loginAsUser } from './helpers/auth';

export const test = base.extend<{ userContext: unknown }>({
  userContext: async ({ page }, use) => {
    // Shared auth context for logged-in tests
    await loginAsUser(page);
    await use(page.context());
  },
});

export { expect } from '@playwright/test';
```

## Test Configuration Reference ( playwright.config.ts )

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './testing/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
    { name: 'Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

## QA Agent Test Execution Rules

1. Run all tests on the deployed/staged URL first (integration mode)
2. Then run locally with `npm run test:e2e` for debug traces if any fail
3. If > 50% of a feature's tests fail, send back to dev with full failure log
4. If individual tests fail, screenshot + trace attached in task comments
5. Accessibility tests must pass at 100% (no exceptions — WCAG AA is non-negotiable)

## Cross-references

| Testing file | Produces from (input) | Consumes by (output) |
|-------------|----------------------|---------------------|
| `features/<feature>/e2e.spec.ts` | PRD §8 User Stories (#N acceptance criteria); component specs (`components/<component>.md`) props API + variants table | QA Agent verification; Dev Reviewer A review per CLAUDE.md Workflow 4 |
| `features/<feature>/a11y.spec.ts` | `accessibility-guidelines.md` §Testing Requirements; each component's accessibility section in `components/`; state required states tables | QA Agent test results → feature-fidelity check; Dev Reviewer C accessibility audit |
| `features/<feature>/states.spec.ts` | All 6 state docs (`states/error.md`, `loading.md`, `success.md`, `empty.md`, `validation.md`, `interaction.md`); component spec required states tables | QA Agent per workflow pattern; feature-fidelity regression check |
| `helpers/form.ts` | `components/form-input.md` variants + Required States table; `states/validation.md` validation error patterns | All form-related tests in features/; ui-best-practices.md §7 form validation rules |

## Related Files

| File | Relationship |
|------|-------------|
| [`../PRD/templates/prd-template.md`](../PRD/templates/prd-template.md) §8 User Stories | Every test traces to a specific user story (#N) — the test name and file path include the PRD section reference |
| `design-system/states/` (all 6 state docs) | Each state doc's Testing Requirements list becomes the playwright test checklist for that state |
| `design-system/components/README.md` Component Index | Maps each user story to a component — determines which tests cover which feature |
| [`skills/accessibility-guidelines.md`](../skills/accessibility-guidelines.md) §Testing Requirements | WCAG AA testing rules (keyboard-only, screen reader, contrast ratios) are implemented as playwright tests |
| `workflows/README.md` Workflow 4 Phase "Review via Playwright" + Workflow 5 Phase "Write Test Suite" | These workflow phases describe the orchestration logic for test execution |
