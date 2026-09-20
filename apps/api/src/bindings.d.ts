/**
 * The Worker's bindings and secrets: one declaration, merged into the ambient
 * `Cloudflare.Env` that both the handlers and the test harness read.
 *
 * Mirrors wrangler.jsonc (bindings and vars) plus .dev.vars / `wrangler secret`
 * for the secrets.
 */
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      /** Where the browser app is served from, for CORS and OAuth redirects. */
      APP_URL: string;
      BETTER_AUTH_SECRET: string;
      GOOGLE_CLIENT_ID: string;
      GOOGLE_CLIENT_SECRET: string;
      /**
       * Turns on email-and-password sign-in so tests can authenticate without
       * Google. Set only by the test harness and never in production, where
       * the absence of the variable leaves the provider off.
       */
      TEST_AUTH_ENABLED?: string;
    }
  }
}

export {};
