import { expect, test } from '@playwright/test';

test('discovery lists animals network-wide', async ({ page }) => {
  await page.goto('/animals');
  await expect(page.getByTestId('animal-card').first()).toBeVisible();
});

test('species filter via URL shows only dogs', async ({ page }) => {
  await page.goto('/animals?species=dog');
  const cards = page.getByTestId('animal-card');
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  const dogs = await page.locator('[data-testid="animal-card"][data-species="dog"]').count();
  expect(dogs).toBe(total);
});

test('opening a card shows the detail with Apply, which renders the application route', async ({
  page,
}) => {
  await page.goto('/animals');
  await page.getByTestId('animal-card').first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/animals\/[0-9a-f-]{36}$/);
  const apply = page.getByTestId('apply-link');
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(page).toHaveURL(/\/apply\//);
});
