import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/where2go/);
});

test('loads map', async ({ page }) => {
  await page.goto('/');

  // Wait for map container to be visible
  await expect(page.locator('.map-container')).toBeVisible();
});
