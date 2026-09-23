import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './db/schema';
import type { Env } from './env';

/** Ninety days: a signed-in phone should not log out because it went offline. */
const SESSION_LIFETIME_SEC = 60 * 60 * 24 * 90;

/**
 * Where the browser app may be served from.
 *
 * A list rather than one value because development runs it on two ports: the
 * dev server, and the preview server the end-to-end tests drive. Better Auth
 * checks the Origin header on state-changing requests, so an origin missing
 * from here fails sign-in with no obvious clue why. Production sets one.
 */
export function appOrigins(env: Pick<Env, 'APP_URL'>): string[] {
  return env.APP_URL.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

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
    trustedOrigins: appOrigins(env),
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
    /*
     * Cookie attributes are deliberately left to Better Auth's defaults, which
     * are SameSite=Lax and Secure over https.
     *
     * An earlier version forced SameSite=None, from when the app and the API
     * were going to be separate origins. They are one Worker now, so None is
     * both unnecessary and harmful: browsers restrict it as part of phasing out
     * third-party cookies, and the symptom is a Google sign-in that completes,
     * redirects home, and lands you signed out. Lax is sent on the top-level
     * navigation the OAuth callback uses, which is what the flow needs.
     */
  });
}

export type Auth = ReturnType<typeof createAuth>;
