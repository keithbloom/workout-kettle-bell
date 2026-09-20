import type { D1Migration } from 'cloudflare:test';

/**
 * The one binding that exists only under test: vitest.config.ts injects the
 * migrations so `test/setup.ts` can apply them to a fresh database.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
