import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createAuth } from './auth.js';
import type { Env } from './env.js';
import { api } from './routes/api.js';

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', (c, next) =>
  cors({
    origin: c.env.APP_URL,
    credentials: true,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })(c, next),
);

app.get('/api/health', (c) => c.json({ ok: true }));

app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env, c.req.url).handler(c.req.raw));

// Everything else under /api needs a session; see routes/api.ts.
app.route('/api', api);

app.onError((err, c) => {
  console.error('unhandled', err instanceof Error ? err.stack : err);
  return c.json({ error: 'internal error' }, 500);
});

export default app;
