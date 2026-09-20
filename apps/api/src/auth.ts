import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema.js';
import type { Env } from './env.js';

/** Ninety days: a signed-in phone should not log out because it went offline. */
const SESSION_LIFETIME_SEC = 60 * 60 * 24 * 90;

/**
 * Built per request rather than once at module scope: on Workers the bindings
 * and secrets arrive with the request, so there is no env to read at import
 * time.
 */
export function createAuth(env: Env, requestUrl: string) {
  const db = drizzle(env.DB, { schema });

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: new URL(requestUrl).origin,
    basePath: '/api/auth',
    trustedOrigins: [env.APP_URL],
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    // Tests sign in with an email and password so they never touch Google.
    // Off unless the harness asks for it, so production has one way in.
    emailAndPassword: { enabled: env.TEST_AUTH_ENABLED === 'true' },
    session: {
      expiresIn: SESSION_LIFETIME_SEC,
      // Only rewrite the session row once a day, so a user training daily
      // isn't writing to D1 on every request.
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      // The API and the app are on different subdomains in production.
      defaultCookieAttributes: { sameSite: 'none', secure: true },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
