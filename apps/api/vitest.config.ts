import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

/**
 * Handlers run on the real Workers runtime against a real (local) D1, with our
 * migrations applied — so a test that passes here exercises the same SQL and
 * the same runtime as production, rather than a mock of them.
 */
const migrations = await readD1Migrations('./migrations');

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          APP_URL: 'http://localhost:5173',
          BETTER_AUTH_SECRET: 'test-secret-not-used-anywhere-real',
          GOOGLE_CLIENT_ID: 'test-client-id',
          GOOGLE_CLIENT_SECRET: 'test-client-secret',
          TEST_AUTH_ENABLED: 'true',
        },
      },
    }),
  ],
  test: {
    globals: true,
    setupFiles: ['./test/setup.ts'],
  },
});
