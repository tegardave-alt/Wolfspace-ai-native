const { test, expect } = require('@playwright/test');

test.describe('Quantum — smoke', () => {
  test('homepage loads with correct title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Quantum');
  });

  test('page renders the root div', async ({ page }) => {
    await page.goto('/');
    const root = page.locator('#root');
    await expect(root).toBeVisible();
  });
});
