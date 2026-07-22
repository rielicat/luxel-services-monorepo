import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

// e2e runs against the DEV server on purpose: the stealth gate only activates
// when NODE_ENV === 'production', so `next dev` renders the app ungated.
export default defineConfig({
  testDir: './e2e',
  // Serial against a single dev server: parallel first-hits make turbopack
  // compile every route at once and time out. One worker keeps compiles ordered.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Cold turbopack compiles a route on first hit; give navigation headroom.
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
