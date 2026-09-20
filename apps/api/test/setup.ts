import { applyD1Migrations, env } from 'cloudflare:test';

// Each test worker starts from an empty database with the real migrations
// applied, so the schema under test is the one that ships.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
