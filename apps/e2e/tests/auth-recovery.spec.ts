import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('forgot-password form shows the always-success alert', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(`nobody-${Date.now()}@example.com`);
  await page.getByRole('button', { name: /send reset link/i }).click();
  await expect(page.getByText('If that email exists we sent a link.')).toBeVisible();
});
