const { test, expect } = require("@playwright/test");

test.describe("WOLFSPACE — smoke", () => {
  test("homepage loads with correct title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("WOLFSPACE");
  });

  test("page renders the root div", async ({ page }) => {
    await page.goto("/");
    const root = page.locator("#root");
    await expect(root).toBeVisible();
  });
});
