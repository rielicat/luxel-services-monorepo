import { test, expect } from '@playwright/test';

const PUBLIC_ROUTES = ['/', '/about', '/services/airbnb', '/calculator'];

for (const route of PUBLIC_ROUTES) {
  test(`renders ${route}`, async ({ page }) => {
    const res = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(res?.status(), `HTTP status for ${route}`).toBeLessThan(400);
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });
}

test('stealth gate is inactive on the dev server', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Acceso restringido')).toHaveCount(0);
});

test('the agent box is docked on the homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByPlaceholder('¿En qué te puedo ayudar hoy?')).toBeVisible();
});

test('the pricing page compares the three plans', async ({ page }) => {
  await page.goto('/calculator');
  await expect(page.getByRole('slider')).toBeVisible();
  for (const plan of ['Fijo', 'Mixto', 'Comisión']) {
    await expect(page.getByRole('heading', { name: plan, exact: true })).toBeVisible();
  }
});
