/**
 * The Worker's environment. Declared in `env.d.ts` so the handlers and the
 * `cloudflare:test` harness share one definition instead of two that drift.
 */
export type Env = Cloudflare.Env;
