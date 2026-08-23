import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const WEB = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:3000';
const ADMIN = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:3001';
const API = process.env.E2E_API_URL ?? 'http://localhost:4000';
const OUT = '../../docs/assets';

mkdirSync(OUT, { recursive: true });

async function apiLogin(email, password) {
  const r = await fetch(`${API}/app/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return r.headers.getSetCookie()[0].split(';')[0];
}

const stamp = Date.now();
const applicantEmail = `shots-${stamp}@x.dev`;

// Seed: applicant with profile + one application so lists are non-empty.
const reg = await fetch(`${API}/app/v1/auth/register`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: applicantEmail, password: 'ShotsPass123' }),
});
const applicantCookie = reg.headers.getSetCookie()[0].split(';')[0];
await fetch(`${API}/app/v1/me/profile`, {
  method: 'PUT',
  headers: { cookie: applicantCookie, 'content-type': 'application/json' },
  body: JSON.stringify({
    legalName: 'Pat Applicant',
    displayName: 'Pat',
    phone: '+15551230000',
    address: '12 Elm Street, Springfield',
  }),
});
const staffCookie = await apiLogin('dev@kithlink.dev', 'DevOnly123!x');
const session = await (
  await fetch(`${API}/app/v1/auth/session`, { headers: { cookie: staffCookie } })
).json();
const shelterId = session.memberships[0].shelterId;
const animals = await (
  await fetch(`${API}/public/v1/shelters/happytail/animals?limit=1`)
).json();
await fetch(`${API}/app/v1/applications`, {
  method: 'POST',
  headers: { cookie: applicantCookie, 'content-type': 'application/json' },
  body: JSON.stringify({ animalId: animals.items[0].id, answers: { why_this_pet: 'Loving home ready.' } }),
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });

// Public web
await page.goto(`${WEB}/`);
await page.waitForTimeout(800);
await shot('web-home');
await page.goto(`${WEB}/shelters`);
await page.waitForTimeout(600);
await shot('web-shelters');
await page.goto(`${WEB}/shelters/happytail`);
await page.waitForTimeout(600);
await shot('web-shelter-detail');

// Applicant journey — register may 409 on reruns; either way end up logged in.
await page.goto(`${WEB}/register`);
await page.getByLabel('Email').fill(applicantEmail);
await page.getByLabel('Password').fill('ShotsPass123');
await page.getByRole('button', { name: 'Create account' }).click();
await page
  .waitForURL(/profile|login/, { timeout: 15000 })
  .catch(() => undefined);
if (!/profile/.test(page.url())) {
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email').fill(applicantEmail);
  await page.getByLabel('Password').fill('ShotsPass123');
  await page.getByRole('button', { name: 'Log in' }).click();
}
await page.waitForURL(/dashboard|profile/, { timeout: 20000 });
await page.goto(`${WEB}/profile`);
await page.waitForTimeout(500);
await shot('web-register');
await page.waitForTimeout(400);
await shot('web-register');
await page.goto(`${WEB}/applications`);
await page.waitForTimeout(600);
await shot('web-applications');
await page.goto(`${WEB}/artifacts`);
await page.waitForTimeout(600);
await shot('web-artifacts');

// Admin
const admin = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const apage = await admin.newPage();
const ash = (name) => apage.screenshot({ path: `${OUT}/${name}.png` });
await apage.goto(`${ADMIN}/`);
await apage.waitForTimeout(300);
await ash('admin-login');
await apage.getByLabel('Email').fill('dev@kithlink.dev');
await apage.getByLabel('Password').fill('DevOnly123!x');
await apage.getByRole('button', { name: 'Sign in' }).click();
await apage.waitForURL(/dashboard/);
await apage.waitForTimeout(700);
await ash('admin-dashboard');
await apage.goto(`${ADMIN}/applications`);
await apage.waitForTimeout(700);
await ash('admin-applications');
await apage.goto(`${ADMIN}/site`);
await apage.waitForTimeout(700);
await ash('admin-site-editor');
await apage.goto(`${ADMIN}/sync`);
await apage.waitForTimeout(500);
await ash('admin-sync');

// Dark mode sample of web home
const dark = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  colorScheme: 'dark',
});
const dpage = await dark.newPage();
await dpage.goto(`${WEB}/`);
await dpage.waitForTimeout(800);
await dpage.screenshot({ path: `${OUT}/web-home-dark.png` });

// Generated shelter site (public HTML from API)
const html = await (await fetch(`${API}/public/v1/sites/happytail/index.html`)).text();
await page.goto('about:blank');
await page.setContent(html, { waitUntil: 'load' });
await shot('site-happytail');

await browser.close();
console.log('screenshots written to docs/assets');
