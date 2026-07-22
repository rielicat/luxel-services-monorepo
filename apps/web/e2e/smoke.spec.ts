import { test, expect } from '@playwright/test';

// Public, auth-free routes. These render without hitting Supabase/Clerk APIs,
// so they're safe to smoke-test against a stubbed dev server.
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/services/airbnb',
  '/services/cleaning',
  '/calculator',
  '/calculator?service=airbnb',
  '/calculator?service=cleaning',
];

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

test('the calculator lets you pick either service', async ({ page }) => {
  await page.goto('/calculator');
  await expect(page.getByText('Administración', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Aseo', { exact: false }).first()).toBeVisible();
});
