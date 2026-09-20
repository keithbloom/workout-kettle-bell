import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the real stack: the Vite app in front of the Worker
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
    baseURL: 'http://localhost:5173',
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
      command: 'pnpm --filter @kb/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 120_000,
    },
  ],
});
