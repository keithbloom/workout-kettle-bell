import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against exactly what gets deployed: one Worker serving the
 * built web app and the API from a single origin, over a local D1.
 *
 * Playwright builds the app and starts the Worker itself, so
 * `pnpm --filter @kb/e2e test` is the whole command — no separate setup to
 * remember here or to script in CI.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://localhost:8787',
    trace: 'retain-on-failure',
    // A phone is the target; test at that size by default.
    ...devices['Pixel 7'],
  },

  // Built, not dev-served: the service worker and the precached shell only
  // exist in a production build, and they are what makes the app work without
  // a signal. Testing the dev server would skip all of that.
  webServer: {
    command: 'pnpm --filter @kb/web build && pnpm --filter @kb/api dev',
    url: 'http://localhost:8787/api/health',
    reuseExistingServer: false,
    cwd: '..',
    timeout: 180_000,
  },
});
