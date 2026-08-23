import { expect, test, request as playwrightRequest } from '@playwright/test';
import type { APIRequestContext, APIResponse } from '@playwright/test';

const API_URL = 'http://127.0.0.1:4000';
const SESSION_COOKIE = 'kithlink_session';
const DEV_EMAIL = 'dev@kithlink.dev';
const DEV_PASSWORD = 'DevOnly123!x';

interface StaffSession {
  user: { id: string; email: string };
  memberships: Array<{ shelterId: string; shelterName: string; role: string }>;
}

interface AnimalListItem {
  id: string;
  status: string;
}

interface AnimalListResponse {
  items: AnimalListItem[];
  nextCursor: string | null;
}

test.describe.configure({ mode: 'serial' });

const email = `applicant-${Date.now()}@example.com`;
const password = 'ApplicantPass1x';
const legalName = 'Pat Applicant';

let applicantApi: APIRequestContext;

function sessionCookie(response: APIResponse): string {
  const cookie = response
    .headersArray()
    .filter(
      header =>
        header.name.toLowerCase() === 'set-cookie' &&
        header.value.includes(SESSION_COOKIE + '=')
    )
    .map(header => header.value.split(';')[0])
    .pop();
  if (!cookie) throw new Error(`no ${SESSION_COOKIE} cookie on response`);
  return cookie;
}

test.beforeAll(async () => {
  const bootstrap = await playwrightRequest.newContext();

  const staffLogin = await bootstrap.post(`${API_URL}/app/v1/auth/login`, {
    data: { email: DEV_EMAIL, password: DEV_PASSWORD },
  });
  if (!staffLogin.ok()) throw new Error(`staff login failed (${staffLogin.status()})`);

  const staffSession = await bootstrap.get(`${API_URL}/app/v1/auth/session`, {
    headers: { cookie: sessionCookie(staffLogin) },
  });
  if (!staffSession.ok()) throw new Error(`staff session failed (${staffSession.status()})`);
  const session = (await staffSession.json()) as StaffSession;
  const shelterId = session.memberships[0]?.shelterId;
  if (!shelterId) throw new Error('dev user has no shelter membership');

  const staffApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: sessionCookie(staffLogin) },
  });
  try {
    const animalsRes = await staffApi.get(
      `${API_URL}/admin/v1/shelters/${shelterId}/animals?limit=100`
    );
    if (!animalsRes.ok()) throw new Error(`animal list failed (${animalsRes.status()})`);
    const animals = (await animalsRes.json()) as AnimalListResponse;
    if (!animals.items.some(animal => animal.status === 'available')) {
      const created = await staffApi.post(
        `${API_URL}/admin/v1/shelters/${shelterId}/animals`,
        { data: { name: `Biscuit-${Date.now()}`, species: 'dog' } }
      );
      if (!created.ok()) throw new Error(`animal seed failed (${created.status()})`);
    }
  } finally {
    await staffApi.dispose();
  }

  const registered = await bootstrap.post(`${API_URL}/app/v1/auth/register`, {
    data: { email, password },
  });
  if (!registered.ok()) throw new Error(`register failed (${registered.status()})`);

  const login = await bootstrap.post(`${API_URL}/app/v1/auth/login`, {
    data: { email, password },
  });
  if (!login.ok()) throw new Error(`applicant login failed (${login.status()})`);

  applicantApi = await playwrightRequest.newContext({
    extraHTTPHeaders: { cookie: sessionCookie(login) },
  });
  const profile = await applicantApi.put(`${API_URL}/app/v1/me/profile`, {
    data: {
      legalName,
      displayName: 'Pat',
      phone: '+15551230000',
      address: '12 Elm Street, Springfield',
    },
  });
  if (!profile.ok()) throw new Error(`profile setup failed (${profile.status()})`);
});

test.afterAll(async () => {
  await applicantApi.dispose();
});

test('applicant journey: login → dashboard → profile prefill → apply → applications list', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/profile');
  await expect(page.getByLabel('Legal name')).toHaveValue(legalName);

  await page.goto('/shelters/happytail');
  await page.getByTestId('apply-link').first().click();
  await page
    .getByLabel('Why this pet?')
    .fill('We have a quiet home and a fenced yard for daily walks.');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByTestId('success-msg')).toContainText('Application submitted');

  await page.goto('/applications');
  await expect(page.getByTestId('status-badge').first()).toHaveText('submitted');
});
