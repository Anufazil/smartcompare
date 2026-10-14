import { test, expect } from '@playwright/test';
test('search, explain recommendation, switch preference and inspect fees', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo catalog', exact: true }).click();
  await page.getByRole('button', { name: 'iPhone 15', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Comparison results' })).toBeVisible();
  await expect(page.locator('.recommended')).toHaveCount(1);
  await page.getByRole('button', { name: 'Lowest price', exact: true }).click();
  await expect(page.locator('.recommended h3')).toHaveText('Flipkart');
  await expect(page.locator('.recommended .fee-breakdown')).toContainText('Handling');
  await page.locator('.recommended').getByRole('button', { name: 'View deal' }).click();
  await expect(page.getByRole('dialog')).toContainText('demo comparison');
});
test('manual location, empty state and filters', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo catalog', exact: true }).click();
  await page.getByRole('button', { name: 'DELIVERING TO Bengaluru' }).click();
  await page.getByRole('button', { name: 'Mumbai', exact: true }).click();
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('button', { name: 'DELIVERING TO Mumbai' })).toBeVisible();
  await page.getByPlaceholder('What’s on your shopping list?').fill('Nonexistent widget 123');
  await page.getByRole('button', { name: 'Compare prices' }).click();
  await expect(page.getByText('No matching products. Yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Amul milk', exact: true }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Maximum total (₹)' }).fill('1');
  await expect(page.getByText('No options match these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).first().click();
  await expect(page.locator('.comparison-card')).toHaveCount(4);
});
test('product deep link and page reload complete initial search', async ({ page }) => {
  await page.route('**/api/v1/compare/live', (route) =>
    route.fulfill({
      json: {
        success: true,
        query: 'Apple iPhone 15',
        location: {},
        preference: 'balanced',
        results: [],
        metadata: {
          demo: false,
          generatedAt: new Date().toISOString(),
          cached: false,
          durationMs: 0,
          connectorStatuses: [],
          searchLinks: [],
          notice: 'Fixture live source unavailable',
        },
      },
    }),
  );
  await page.goto('/product/apple-iphone-15-128gb-black');
  await expect(page.getByText('No readable live prices this time.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('No readable live prices this time.')).toBeVisible();
  await expect(page).toHaveTitle(/Compare Apple iPhone 15/);
});
test('shows loading then handles API failure', async ({ page }) => {
  await page.route('**/api/v1/compare/live', async (route) => {
    await new Promise((r) => setTimeout(r, 400));
    await route.fulfill({
      status: 503,
      json: {
        success: false,
        error: { message: 'We could not complete the comparison. Please try again.' },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'iPhone 15', exact: true }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.locator('.error-message')).toContainText('could not complete');
});
test('stays within the viewport', async ({ page }) => {
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
