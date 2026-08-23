import { expect, test, request as playwrightRequest } from '@playwright/test';

const API_URL = 'http://127.0.0.1:4000';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:3001';
const WEB_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000';
const DEV_EMAIL = 'dev@kithlink.dev';
const DEV_PASSWORD = 'DevOnly123!x';

test('admin sees the journeys table and adopters see a warm missing card', async ({ page }) => {
  const bootstrap = await playwrightRequest.newContext();
  try {
    await page.goto(`${ADMIN_URL}/`);
    await page.getByLabel('Email').fill(DEV_EMAIL);
    await page.getByLabel('Password').fill(DEV_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/dashboard$/);

    await page.goto(`${ADMIN_URL}/journeys`);
    await expect(page.getByRole('heading', { name: 'Journeys' })).toBeVisible();
    await expect(page.getByTestId('journeys-table').or(page.getByText('No adoption journeys yet.'))).toBeVisible();

    await page.goto(`${WEB_URL}/journey?jt=bogus-token-1234567890abcdef`);
    const missing = page.getByTestId('journey-missing');
    await expect(missing).toBeVisible();
    await expect(missing).toContainText('expired or was already used');
  } finally {
    await bootstrap.dispose();
  }
});
