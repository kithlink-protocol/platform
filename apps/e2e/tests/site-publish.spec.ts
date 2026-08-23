import { expect, test } from '@playwright/test';

const API_URL = 'http://127.0.0.1:4000';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:3001';
const DEV_EMAIL = 'dev@kithlink.dev';
const DEV_PASSWORD = 'DevOnly123!x';

test('staff publishes the shelter site from the admin dashboard', async ({ page, request }) => {
  await page.goto(`${ADMIN_URL}/`);
  await page.getByLabel('Email').fill(DEV_EMAIL);
  await page.getByLabel('Password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/dashboard$/);

  await page.getByRole('link', { name: 'Site' }).click();
  await page.waitForURL(/\/site$/);
  await page.getByLabel('Hero title').fill('Happy Tails Every Day');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('site-saved')).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  const publishedAt = page.getByTestId('published-at');
  await expect(publishedAt).toBeVisible();
  await expect(publishedAt).toContainText(/Published at \d{4}-\d{2}-\d{2}T/);
  await expect(page.getByRole('link', { name: 'View site' })).toBeVisible();

  // Propagation guard: poll until the published bundle is the one this publish produced.
  await expect
    .poll(
      async () => {
        const r = await request.get(`${API_URL}/public/v1/sites/happytail/index.html`);
        return r.status() === 200 ? await r.text() : '';
      },
      { timeout: 10_000, intervals: [250] },
    )
    .toContain('Happy Tails Every Day');

  const res = await request.get(`${API_URL}/public/v1/sites/happytail/index.html`);
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<!doctype html>');
  expect(html).toContain('Happy Tails Every Day');

  const current = await request.get(`${API_URL}/public/v1/sites/happytail/CURRENT`);
  expect(current.status()).toBe(200);
  expect((await current.text()).trim()).toMatch(/^[0-9a-f-]{36}$/);

  const rss = await request.get(`${API_URL}/public/v1/feed/shelters/happytail/rss.xml`);
  expect(rss.status()).toBe(200);
  expect(await rss.text()).toContain('<item>');
});
