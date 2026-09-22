import { Hono } from 'hono';
import { createAuth } from './auth.js';
import type { Env } from './env.js';
import { api } from './routes/api.js';

/**
 * The whole application: this Worker serves the built web app as static assets
 * and handles /api itself, so the browser only ever talks to one origin.
 *
 * That is why there is no CORS middleware here. There is no cross-origin
 * request to permit — in development the Vite proxy keeps the browser on one
 * origin too — and the session cookie is an ordinary first-party cookie rather
 * than the kind browsers increasingly refuse.
 */
const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));

app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env, c.req.url).handler(c.req.raw));

// Everything else under /api needs a session; see routes/api.ts.
app.route('/api', api);

app.onError((err, c) => {
  console.error('unhandled', err instanceof Error ? err.stack : err);
  return c.json({ error: 'internal error' }, 500);
});

export default app;
