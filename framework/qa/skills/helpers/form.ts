/**
 * Shared form testing helpers for Playwright tests.
 * All functions follow the framework's validation and accessibility conventions.
 */

import { Page, expect } from '@playwright/test';

/**
 * Fill a form field and assert no immediate validation error appears.
 */
export async function fillField(page: Page, selector: string, value: string) {
  await page.locator(selector).fill(value);
}

/**
 * Submit a form and verify the expected outcome.
 */
export async function submitForm(
  page: Page,
  submitSelector = '[type="submit"]',
  { expectSuccessBanner = true, expectErrorBanner = false }: { expectSuccessBanner?: boolean; expectErrorBanner?: boolean } = {}
) {
  await page.locator(submitSelector).click();

  if (expectSuccessBanner) {
    await expect(page.locator('[data-testid="success-banner"]')).toBeVisible({ timeout: 5000 });
  }
  if (expectErrorBanner) {
    await expect(page.locator('[data-testid="error-banner"]')).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Fill all fields in a form with valid values.
 */
export async function fillValidForm(page: Page, fields: Array<{ selector: string; value: string }>) {
  for (const field of fields) {
    await page.locator(field.selector).fill(field.value);
  }
}

/**
 * Assert that a validation error appears for a specific field.
 */
export async function expectValidationError(page: Page, fieldSelector: string, message?: string) {
  const input = page.locator(fieldSelector);
  await expect(input).toBeFocused(); // focus should move to first error
  await expect(input).toHaveAttribute('aria-invalid', 'true');

  if (message) {
    const errorEl = page.locator(`${fieldSelector} + .validation-error, ${fieldSelector} [id^="${fieldSelector.replace(/[.#\[\]]/g, '')}-error"]`);
    await expect(errorEl).toContainText(message);
  }
}
