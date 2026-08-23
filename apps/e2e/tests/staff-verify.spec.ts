import { expect, test, request as playwrightRequest } from '@playwright/test';

const API_URL = 'http://127.0.0.1:4000';
const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:3001';
const SESSION_COOKIE = 'kithlink_session';
const DEV_EMAIL = 'dev@kithlink.dev';
const DEV_PASSWORD = 'DevOnly123!x';

function sessionCookie(response: {
  headersArray: () => { name: string; value: string }[];
}): string {
  const cookie = response
    .headersArray()
    .filter(header => header.name.toLowerCase() === 'set-cookie')
    .map(header => header.value)
    .find(value => value.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error(`no ${SESSION_COOKIE} cookie on response`);
  return cookie.split(';')[0]!;
}

test('staff verifies an artifact from the application review screen', async ({ page }) => {
  const bootstrap = await playwrightRequest.newContext();

  const staffLogin = await bootstrap.post(`${API_URL}/app/v1/auth/login`, {
    data: { email: DEV_EMAIL, password: DEV_PASSWORD },
  });
  expect(staffLogin.ok()).toBeTruthy();
  const staffCookie = sessionCookie(staffLogin);

  const sessionRes = await bootstrap.get(`${API_URL}/app/v1/auth/session`, {
    headers: { cookie: staffCookie },
  });
  const session = (await sessionRes.json()) as {
    memberships: Array<{ shelterId: string }>;
  };
  const shelterId = session.memberships[0]?.shelterId;
  expect(shelterId).toBeTruthy();

  const email = `m2-e2e-${Date.now()}@x.dev`;
  await bootstrap.post(`${API_URL}/app/v1/auth/register`, {
    data: { email, password: 'Password123x' },
  });
  const applicantLogin = await bootstrap.post(`${API_URL}/app/v1/auth/login`, {
    data: { email, password: 'Password123x' },
  });
  const applicantCookie = sessionCookie(applicantLogin);

  const applicantApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: applicantCookie },
  });
  try {
    const profile = await applicantApi.put(`${API_URL}/app/v1/me/profile`, {
      data: {
        legalName: 'Stella Verifier',
        displayName: 'Stella',
        phone: '+15551002000',
      },
    });
    expect(profile.ok()).toBeTruthy();

    const upload = await applicantApi.post(`${API_URL}/app/v1/me/artifacts`, {
      data: { type: 'lease_addendum', mime: 'application/pdf', bytes: 2048 },
    });
    expect(upload.ok()).toBeTruthy();

  const staffApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: staffCookie },
  });
  const animalName = `M2E2E-${Date.now()}`;
  try {
    const createdAnimal = await staffApi.post(
      `${API_URL}/admin/v1/shelters/${shelterId}/animals`,
      { data: { name: animalName, species: 'dog' } }
    );
    expect(createdAnimal.ok()).toBeTruthy();
    const animalId = ((await createdAnimal.json()) as { id: string }).id;

    const apply = await applicantApi.post(`${API_URL}/app/v1/applications`, {
      data: { animalId, answers: { why_this_pet: 'M2 e2e verification flow' } },
    });
    expect(apply.ok()).toBeTruthy();
  } finally {
    await staffApi.dispose();
  }

  await page.goto(`${ADMIN_URL}/`);
  await page.getByLabel('Email').fill(DEV_EMAIL);
  await page.getByLabel('Password').fill(DEV_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/dashboard$/);

  await page.goto(`${ADMIN_URL}/applications`);
  await page.getByRole('link', { name: animalName }).first().click();
  await expect(page.getByTestId('artifact-card').first()).toBeVisible();

    page.on('dialog', dialog => dialog.accept('Called landlord; pet policy confirmed.'));
    await page.getByRole('button', { name: 'Confirm landlord call' }).first().click();

    await expect(page.getByTestId('artifact-state').first()).toHaveText('verified');
    await expect(page.getByText('Verifications (1)').first()).toBeVisible();
  } finally {
    await applicantApi.dispose();
    await bootstrap.dispose();
  }
});
