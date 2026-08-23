# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: applicant.spec.ts >> applicant journey: login → dashboard → profile prefill → apply → applications list
- Location: tests/applicant.spec.ts:110:5

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator: getByLabel('Legal name')
Expected: "Pat Applicant"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveValue" with timeout 5000ms
  - waiting for getByLabel('Legal name')

```

```yaml
- alert
- dialog "Server Error":
  - navigation:
    - button "previous" [disabled]:
      - img "previous"
    - button "next" [disabled]:
      - img "next"
    - text: 1 of 1 error Next.js (14.2.35) is outdated
    - link "(learn more)":
      - /url: https://nextjs.org/docs/messages/version-staleness
  - heading "Server Error" [level=1]
  - paragraph: "TypeError: Cannot read properties of null (reading 'useContext')"
  - text: This error happened while generating the page. Any console logs will be displayed in the terminal window.
  - heading "Call Stack" [level=2]
  - group:
    - img
    - img
    - text: Next.js
  - heading "PathnameContext" [level=3]
  - text: webpack:/src/client/components/navigation.ts
  - heading "ErrorBoundary" [level=3]
  - text: webpack:/src/client/components/error-boundary.tsx
  - group:
    - img
    - img
    - text: Next.js
```

# Test source

```ts
  20  |   items: AnimalListItem[];
  21  |   nextCursor: string | null;
  22  | }
  23  | 
  24  | test.describe.configure({ mode: 'serial' });
  25  | 
  26  | const email = `applicant-${Date.now()}@example.com`;
  27  | const password = 'ApplicantPass1x';
  28  | const legalName = 'Pat Applicant';
  29  | 
  30  | let applicantApi: APIRequestContext;
  31  | 
  32  | function sessionCookie(response: APIResponse): string {
  33  |   const cookie = response
  34  |     .headersArray()
  35  |     .filter(
  36  |       header =>
  37  |         header.name.toLowerCase() === 'set-cookie' &&
  38  |         header.value.includes(SESSION_COOKIE + '=')
  39  |     )
  40  |     .map(header => header.value.split(';')[0])
  41  |     .pop();
  42  |   if (!cookie) throw new Error(`no ${SESSION_COOKIE} cookie on response`);
  43  |   return cookie;
  44  | }
  45  | 
  46  | test.beforeAll(async () => {
  47  |   const bootstrap = await playwrightRequest.newContext();
  48  | 
  49  |   const staffLogin = await bootstrap.post(`${API_URL}/app/v1/auth/login`, {
  50  |     data: { email: DEV_EMAIL, password: DEV_PASSWORD },
  51  |   });
  52  |   if (!staffLogin.ok()) throw new Error(`staff login failed (${staffLogin.status()})`);
  53  | 
  54  |   const staffSession = await bootstrap.get(`${API_URL}/app/v1/auth/session`, {
  55  |     headers: { cookie: sessionCookie(staffLogin) },
  56  |   });
  57  |   if (!staffSession.ok()) throw new Error(`staff session failed (${staffSession.status()})`);
  58  |   const session = (await staffSession.json()) as StaffSession;
  59  |   const shelterId = session.memberships[0]?.shelterId;
  60  |   if (!shelterId) throw new Error('dev user has no shelter membership');
  61  | 
  62  |   const staffApi = await playwrightRequest.newContext({
  63  |     extraHTTPHeaders: { cookie: sessionCookie(staffLogin) },
  64  |   });
  65  |   try {
  66  |     const animalsRes = await staffApi.get(
  67  |       `${API_URL}/admin/v1/shelters/${shelterId}/animals?limit=100`
  68  |     );
  69  |     if (!animalsRes.ok()) throw new Error(`animal list failed (${animalsRes.status()})`);
  70  |     const animals = (await animalsRes.json()) as AnimalListResponse;
  71  |     if (!animals.items.some(animal => animal.status === 'available')) {
  72  |       const created = await staffApi.post(
  73  |         `${API_URL}/admin/v1/shelters/${shelterId}/animals`,
  74  |         { data: { name: `Biscuit-${Date.now()}`, species: 'dog' } }
  75  |       );
  76  |       if (!created.ok()) throw new Error(`animal seed failed (${created.status()})`);
  77  |     }
  78  |   } finally {
  79  |     await staffApi.dispose();
  80  |   }
  81  | 
  82  |   const registered = await bootstrap.post(`${API_URL}/app/v1/auth/register`, {
  83  |     data: { email, password },
  84  |   });
  85  |   if (!registered.ok()) throw new Error(`register failed (${registered.status()})`);
  86  | 
  87  |   const login = await bootstrap.post(`${API_URL}/app/v1/auth/login`, {
  88  |     data: { email, password },
  89  |   });
  90  |   if (!login.ok()) throw new Error(`applicant login failed (${login.status()})`);
  91  | 
  92  |   applicantApi = await playwrightRequest.newContext({
  93  |     extraHTTPHeaders: { cookie: sessionCookie(login) },
  94  |   });
  95  |   const profile = await applicantApi.put(`${API_URL}/app/v1/me/profile`, {
  96  |     data: {
  97  |       legalName,
  98  |       displayName: 'Pat',
  99  |       phone: '+15551230000',
  100 |       address: '12 Elm Street, Springfield',
  101 |     },
  102 |   });
  103 |   if (!profile.ok()) throw new Error(`profile setup failed (${profile.status()})`);
  104 | });
  105 | 
  106 | test.afterAll(async () => {
  107 |   await applicantApi.dispose();
  108 | });
  109 | 
  110 | test('applicant journey: login → dashboard → profile prefill → apply → applications list', async ({
  111 |   page,
  112 | }) => {
  113 |   await page.goto('/login');
  114 |   await page.getByLabel('Email').fill(email);
  115 |   await page.getByLabel('Password').fill(password);
  116 |   await page.getByRole('button', { name: 'Log in' }).click();
  117 |   await expect(page).toHaveURL(/\/dashboard$/);
  118 | 
  119 |   await page.goto('/profile');
> 120 |   await expect(page.getByLabel('Legal name')).toHaveValue(legalName);
      |                                               ^ Error: expect(locator).toHaveValue(expected) failed
  121 | 
  122 |   await page.goto('/shelters/happytail');
  123 |   await page.getByTestId('apply-link').first().click();
  124 |   await page
  125 |     .getByLabel('Why this pet?')
  126 |     .fill('We have a quiet home and a fenced yard for daily walks.');
  127 |   await page.getByRole('button', { name: 'Submit application' }).click();
  128 |   await expect(page.getByTestId('success-msg')).toContainText('Application submitted');
  129 | 
  130 |   await page.goto('/applications');
  131 |   await expect(page.getByTestId('status-badge').first()).toHaveText('submitted');
  132 | });
  133 | 
```