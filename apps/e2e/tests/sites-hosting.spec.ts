import { expect, test, request as playwrightRequest } from '@playwright/test';

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000';
const WEB_URL = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:3001';
const DEV_EMAIL = 'dev@kithlink.dev';
const DEV_PASSWORD = 'DevOnly123!x';

test.describe.configure({ mode: 'serial' });

let staffCookieHeader = '';

function extractSessionCookie(response: {
  headersArray: () => { name: string; value: string }[];
}): string {
  const cookie = response
    .headersArray()
    .filter(h => h.name.toLowerCase() === 'set-cookie')
    .map(h => h.value)
    .find(v => v.includes('kithlink_session='));
  if (!cookie) throw new Error('no session cookie on login response');
  return cookie.split(';')[0]!;
}

test.beforeAll(async () => {
  const bootstrap = await playwrightRequest.newContext();
  const login = await bootstrap.post(`${API_URL}/app/v1/auth/login`, {
    data: { email: DEV_EMAIL, password: DEV_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  staffCookieHeader = extractSessionCookie(login);
  await bootstrap.dispose();
});

test('one-click setup publishes site from the admin UI', async ({ page }) => {
  await page.goto(`${ADMIN_URL}/`);
  await page.getByLabel('Email').fill(DEV_EMAIL);
  await page.getByLabel('Password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/dashboard/);

  await page.goto(`${ADMIN_URL}/site`);
  const cta = page.getByTestId('setup-cta');
  if ((await cta.count()) > 0) {
    await cta.first().click();
  }
  await expect(page.getByTestId('setup-done').or(page.getByTestId('published-at')).first()).toBeVisible();
});

test('resolve endpoint maps host to slug', async ({ request }) => {
  const res = await request.get(`${API_URL}/public/v1/sites/resolve?host=happytail.sites.localhost`);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { slug: string | null };
  expect(body.slug).toBe('happytail');
});

test('subdomain host serves the generated site through the web app', async ({ request }) => {
  const res = await request.get(`${WEB_URL}/`, {
    headers: { host: 'happytail.sites.localhost:3000' },
  });
  expect(res.status()).toBe(200);
  const html = await res.text();
  expect(html).toContain('<!doctype html>');
  expect(html).toContain('Happytail Rescue');
});

test('unknown host falls through to the regular app', async ({ request }) => {
  const res = await request.get(`${WEB_URL}/login`, {
    headers: { host: 'nothing.sites.localhost:3000' },
  });
  expect(res.status()).toBeLessThan(500);
});
