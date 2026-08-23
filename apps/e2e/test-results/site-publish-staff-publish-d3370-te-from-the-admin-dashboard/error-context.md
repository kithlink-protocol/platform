# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site-publish.spec.ts >> staff publishes the shelter site from the admin dashboard
- Location: tests/site-publish.spec.ts:8:5

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "Happy Tails Every Day"
Received string:    "<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>Happytail Rescue</title>
<style>body{font-family:system-ui,sans-serif;margin:0 auto;max-width:60rem;padding:1rem;color:#1f2937}header nav a{margin-right:.75rem}.animal-grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));padding:0;list-style:none}.animal-card{border:1px solid #e5e7eb;border-radius:.5rem;padding:1rem}.muted{color:#6b7280}</style>
</head>
<body>
<header>
<h1>&lt;b&gt;bold&lt;/b&gt; Happy Tails</h1>
<p>Adopt don&#39;t shop &amp; visit</p>
<nav><a href=\"/index.html\">Home</a><a href=\"/animals.html\">Animals</a></nav>
</header>
<main>
<section>
<h2>Adoptable friends</h2>
<ul class=\"animal-grid\"><li class=\"animal-card\">
<h2>Rex</h2>
<p class=\"muted\">dog · Labrador mix · available</p>
<p>Ball is life.</p>
</li>
<li class=\"animal-card\">
<h2>Mochi</h2>
<p class=\"muted\">cat · Mixed · available</p>
<p>Lap cat extraordinaire.</p>
</li>
<li class=\"animal-card\">
<h2>Pepper</h2>
<p class=\"muted\">other · Holland Lop · available</p>
<p>Hop enthusiast.</p>
</li>
<li class=\"animal-card\">
<h2>PubProbe-1787461391886</h2>
<p class=\"muted\">dog · Mixed · available</p>
<p></p>
</li>
<li class=\"animal-card\">
<h2>Biscuit</h2>
<p class=\"muted\">dog · Mixed · available</p>
<p></p>
</li>
<li class=\"animal-card\">
<h2>Miso</h2>
<p class=\"muted\">cat · Mixed · available</p>
<p></p>
</li>
<li class=\"animal-card\">
<h2>M2A</h2>
<p class=\"muted\">dog · Mixed · available</p>
<p></p>
</li>
<li class=\"animal-card\">
<h2>M3Rss-1787461392528</h2>
<p class=\"muted\">cat · Mixed · available</p>
<p></p>
</li></ul>
</section>
</main>
<footer class=\"muted\">Powered by Kithlink</footer>
</body>
</html>"
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e3]:
    - generic [ref=e4]:
      - heading "Shelter site" [level=1] [ref=e5]
      - paragraph [ref=e6]: Public site for /happytail · last published 2026-08-23T05:03:12.583Z
      - paragraph [ref=e7]:
        - link "Back to dashboard" [ref=e8] [cursor=pointer]:
          - /url: /dashboard
    - region [ref=e9]:
      - heading "Site content" [level=2] [ref=e10]
      - generic [ref=e11]:
        - paragraph [ref=e12]:
          - generic [ref=e13]: Hero title
          - textbox "Hero title" [ref=e14]: Happy Tails Every Day
        - paragraph [ref=e15]:
          - generic [ref=e16]: Hero body
          - textbox "Hero body" [ref=e17]: Adopt don't shop & visit
        - paragraph [ref=e18]:
          - generic [ref=e19]: Theme
          - combobox "Theme" [ref=e20]:
            - option "default" [selected]
            - option "rescue-min"
        - paragraph [ref=e21]:
          - generic [ref=e22]: Logo URL
          - textbox "Logo URL" [ref=e23]:
            - /placeholder: https://…
        - paragraph [ref=e24]:
          - generic [ref=e25]: Primary color
          - textbox "Primary color" [ref=e26]: "#2563eb"
        - button "Save" [ref=e27] [cursor=pointer]
        - text: Saved.
    - region [ref=e28]:
      - heading "Publish" [level=2] [ref=e29]
      - button "Publishing…" [disabled] [ref=e30] [cursor=pointer]
      - paragraph [ref=e31]:
        - text: Published at 2026-08-23T05:03:12.583Z
        - link "View site" [ref=e32] [cursor=pointer]:
          - /url: http://localhost:4000/public/v1/sites/happytail
  - alert [ref=e33]
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | const API_URL = 'http://127.0.0.1:4000';
  4  | const ADMIN_URL = process.env.E2E_ADMIN_URL ?? 'http://127.0.0.1:3001';
  5  | const DEV_EMAIL = 'dev@kithlink.dev';
  6  | const DEV_PASSWORD = 'DevOnly123!x';
  7  | 
  8  | test('staff publishes the shelter site from the admin dashboard', async ({ page, request }) => {
  9  |   await page.goto(`${ADMIN_URL}/`);
  10 |   await page.getByLabel('Email').fill(DEV_EMAIL);
  11 |   await page.getByLabel('Password').fill(DEV_PASSWORD);
  12 |   await page.getByRole('button', { name: 'Sign in' }).click();
  13 |   await page.waitForURL(/dashboard$/);
  14 | 
  15 |   await page.getByRole('link', { name: 'Site' }).click();
  16 |   await page.waitForURL(/\/site$/);
  17 |   await page.getByLabel('Hero title').fill('Happy Tails Every Day');
  18 |   await page.getByRole('button', { name: 'Save' }).click();
  19 |   await expect(page.getByTestId('site-saved')).toBeVisible();
  20 | 
  21 |   await page.getByRole('button', { name: 'Publish' }).click();
  22 |   const publishedAt = page.getByTestId('published-at');
  23 |   await expect(publishedAt).toBeVisible();
  24 |   await expect(publishedAt).toContainText(/Published at \d{4}-\d{2}-\d{2}T/);
  25 |   await expect(page.getByRole('link', { name: 'View site' })).toBeVisible();
  26 | 
  27 |   const res = await request.get(`${API_URL}/public/v1/sites/happytail/index.html`);
  28 |   expect(res.status()).toBe(200);
  29 |   const html = await res.text();
  30 |   expect(html).toContain('<!doctype html>');
> 31 |   expect(html).toContain('Happy Tails Every Day');
     |                ^ Error: expect(received).toContain(expected) // indexOf
  32 | 
  33 |   const current = await request.get(`${API_URL}/public/v1/sites/happytail/CURRENT`);
  34 |   expect(current.status()).toBe(200);
  35 |   expect((await current.text()).trim()).toMatch(/^[0-9a-f-]{36}$/);
  36 | 
  37 |   const rss = await request.get(`${API_URL}/public/v1/feed/shelters/happytail/rss.xml`);
  38 |   expect(rss.status()).toBe(200);
  39 |   expect(await rss.text()).toContain('<item>');
  40 | });
  41 | 
```