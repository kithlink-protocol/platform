import { expect, test } from '@playwright/test';

test('home page renders Kithlink', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Kithlink/);
});

test('shelters index lists Happytail Rescue', async ({ page }) => {
  await page.goto('/shelters');
  await expect(page.getByRole('link', { name: 'Happytail Rescue' })).toBeVisible();
});

test('happytail shelter shows an available animal card', async ({ page }) => {
  await page.goto('/shelters/happytail');
  await expect(page.getByTestId('animal-card').first()).toBeVisible();
});
