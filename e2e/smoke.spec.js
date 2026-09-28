// @ts-check
import { test, expect } from '@playwright/test';

test('landing page loads and shows UniPilot', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Your Academic Life|بقوة فائقة|Supercharged/i })).toBeVisible({ timeout: 15000 });
});

test('login opens and has university ID field', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /sign in|login|تسجيل الدخول/i }).first().click();
  await expect(page.locator('#universityId')).toBeVisible({ timeout: 5000 });
});

test('pricing page loads', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: /UniPilot Plans|التسعير/i })).toBeVisible({ timeout: 10000 });
});
