import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the real stack: the built app in front of the Worker
 * in front of a local D1.
 *
 * Playwright starts both servers itself, so `pnpm --filter @kb/e2e test` is the
 * whole command — there is no separate setup to remember or to script in CI.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    // A phone is the target; test at that size by default.
    ...devices['Pixel 7'],
  },

  webServer: [
    {
      command: 'pnpm --filter @kb/api dev',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 120_000,
    },
    {
      // Built, not dev-served: the service worker and the precached shell only
      // exist in a production build, and they are what makes the app work
      // without a signal. Testing the dev server would skip all of that.
      command: 'pnpm --filter @kb/web build && pnpm --filter @kb/web preview',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      cwd: '..',
      timeout: 180_000,
    },
  ],
});
