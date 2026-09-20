import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

/**
 * The integration spike: Better Auth running on the Workers runtime, storing
 * users and sessions in D1 through the Drizzle adapter.
 *
 * This is the piece the plan flagged as the main technical risk, so it is
 * checked end to end — a real sign-up writes a real row, and the returned
 * cookie really identifies the user on a later request.
 */

interface SignedUp {
  email: string;
  name: string;
  cookie: string;
}

let nextUser = 0;

/** A fresh user per test: the database is shared across tests in a file. */
async function signUp(): Promise<SignedUp> {
  const n = ++nextUser;
  const email = `keith+${n}@example.com`;
  const name = `Keith ${n}`;

  const res = await SELF.fetch('https://api.test/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password: 'correct-horse-battery' }),
  });
  expect(res.status, await res.clone().text()).toBe(200);

  const cookie = res.headers.get('set-cookie');
  expect(cookie, 'sign-up should set a session cookie').toBeTruthy();

  return { email, name, cookie: cookie!.split(';')[0]! };
}

describe('the worker', () => {
  it('answers a health check', async () => {
    const res = await SELF.fetch('https://api.test/api/health');

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe('better auth on d1', () => {
  it('creates a user row when someone signs up', async () => {
    const { email, name } = await signUp();

    const row = await env.DB.prepare('SELECT email, name FROM user WHERE email = ?')
      .bind(email)
      .first();

    expect(row).toMatchObject({ email, name });
  });

  it('stores a session pointing at that user', async () => {
    const { email } = await signUp();

    const row = await env.DB.prepare(
      'SELECT s.id FROM session s JOIN user u ON u.id = s.user_id WHERE u.email = ?',
    )
      .bind(email)
      .first();

    expect(row).not.toBeNull();
  });

  it('identifies the user from the session cookie', async () => {
    const { email, cookie } = await signUp();

    const res = await SELF.fetch('https://api.test/api/auth/get-session', {
      headers: { cookie },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user?: { email?: string } } | null;
    expect(body?.user?.email).toBe(email);
  });

  it('returns no session without a cookie', async () => {
    const res = await SELF.fetch('https://api.test/api/auth/get-session');

    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it('refuses a second account with the same email', async () => {
    const { email } = await signUp();

    const res = await SELF.fetch('https://api.test/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name: 'Impostor', password: 'another-password' }),
    });

    expect(res.status).toBe(422);
  });
});
