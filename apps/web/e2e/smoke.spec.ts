import { test, expect } from '@playwright/test';

const PUBLIC_ROUTES = ['/', '/about', '/calculator'];

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

test('the pricing page estimates the single fee', async ({ page }) => {
  await page.goto('/calculator');
  await expect(page.getByRole('slider')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lo que te queda cada mes' })).toBeVisible();
  await expect(page.getByText('12% de tus reservas').first()).toBeVisible();
  await expect(page.getByText('por propiedad, IVA incluido').first()).toBeVisible();
  await expect(page.getByText('sin la tarifa de limpieza').first()).toBeVisible();
});

test('the home page states the single fee', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('12% de tus reservas').first()).toBeVisible();
  await expect(page.getByText('por propiedad, IVA incluido').first()).toBeVisible();
});
