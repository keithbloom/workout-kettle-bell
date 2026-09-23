import { SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { KETTLEBELL_AND_MAT } from '@kb/core';

/**
 * The HTTP surface, exercised the way the browser will use it.
 *
 * The ownership checks here are the ones the groups feature will later widen,
 * so every private endpoint is checked twice: that it refuses a stranger, and
 * that it refuses another signed-in user's data.
 */

interface Session {
  cookie: string;
  email: string;
}

let nextUser = 0;

async function signIn(): Promise<Session> {
  const n = ++nextUser;
  const email = `api-user-${n}@example.com`;

  const res = await SELF.fetch('https://api.test/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: `User ${n}`, password: 'correct-horse-battery' }),
  });
  expect(res.status, await res.clone().text()).toBe(200);

  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, email };
}

function get(path: string, session?: Session) {
  return SELF.fetch(`https://api.test${path}`, {
    headers: session ? { cookie: session.cookie } : {},
  });
}

function post(path: string, body: unknown, session?: Session) {
  return SELF.fetch(`https://api.test${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { cookie: session.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function completedSession(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    clientId: crypto.randomUUID(),
    workoutId: KETTLEBELL_AND_MAT.id,
    workoutName: KETTLEBELL_AND_MAT.name,
    startedAt: now - 1_820_000,
    completedAt: now,
    activeSeconds: 1820,
    ...overrides,
  };
}

describe('signed out', () => {
  const privatePaths = ['/api/me', '/api/exercises', '/api/workouts', '/api/sessions'];

  it.each(privatePaths)('refuses %s', async (path) => {
    const res = await get(path);

    expect(res.status).toBe(401);
  });

  it('refuses to record a session', async () => {
    const res = await post('/api/sessions', completedSession());

    expect(res.status).toBe(401);
  });

  it('still answers the health check', async () => {
    const res = await get('/api/health');

    expect(res.status).toBe(200);
  });
});

describe('signed in', () => {
  let session: Session;

  beforeAll(async () => {
    session = await signIn();
  });

  it('says who you are', async () => {
    const res = await get('/api/me', session);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe(session.email);
  });

  it('says whether there is a profile picture', async () => {
    const res = await get('/api/me', session);

    const body = (await res.json()) as { user: { image: string | null } };
    // Null rather than absent: the client has to tell "no picture" from "the
    // field was forgotten", because it falls back differently.
    expect(body.user).toHaveProperty('image');
    expect(body.user.image).toBeNull();
  });

  it('lists the exercise catalogue', async () => {
    const res = await get('/api/exercises', session);

    const body = (await res.json()) as { exercises: { slug: string }[] };
    expect(body.exercises.length).toBeGreaterThan(0);
    expect(body.exercises.map((e) => e.slug)).toContain('swing');
  });

  it('offers the built-in workout', async () => {
    const res = await get('/api/workouts', session);

    const body = (await res.json()) as { workouts: { id: string }[] };
    expect(body.workouts.map((w) => w.id)).toContain(KETTLEBELL_AND_MAT.id);
  });

  it('returns a full workout definition', async () => {
    const res = await get(`/api/workouts/${KETTLEBELL_AND_MAT.id}`, session);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { workout: { sections: unknown[] } };
    expect(body.workout.sections).toHaveLength(KETTLEBELL_AND_MAT.sections.length);
  });

  it('reports a workout that does not exist as missing', async () => {
    const res = await get('/api/workouts/no-such-thing', session);

    expect(res.status).toBe(404);
  });
});

describe('recording a session', () => {
  it('stores it and returns it in history', async () => {
    const session = await signIn();
    const body = completedSession();

    const created = await post('/api/sessions', body, session);
    expect(created.status).toBe(201);

    const history = await get('/api/sessions', session);
    const { sessions, thisWeek } = (await history.json()) as {
      sessions: { clientId: string }[];
      thisWeek: number;
    };

    expect(sessions.map((s) => s.clientId)).toContain(body.clientId);
    expect(thisWeek).toBe(1);
  });

  it('is safe to send twice, as the offline queue may', async () => {
    const session = await signIn();
    const body = completedSession();

    await post('/api/sessions', body, session);
    const second = await post('/api/sessions', body, session);

    expect(second.status).toBe(201);

    const history = await get('/api/sessions', session);
    const { sessions } = (await history.json()) as { sessions: { clientId: string }[] };

    expect(sessions.filter((s) => s.clientId === body.clientId)).toHaveLength(1);
  });

  it('keeps one user’s history out of another’s', async () => {
    const alice = await signIn();
    const bob = await signIn();
    const hers = completedSession();

    await post('/api/sessions', hers, alice);

    const history = await get('/api/sessions', bob);
    const { sessions } = (await history.json()) as { sessions: { clientId: string }[] };

    expect(sessions.map((s) => s.clientId)).not.toContain(hers.clientId);
  });

  it('lets two users use the same client id without colliding', async () => {
    const alice = await signIn();
    const bob = await signIn();
    const clientId = crypto.randomUUID();

    const first = await post('/api/sessions', completedSession({ clientId }), alice);
    const second = await post('/api/sessions', completedSession({ clientId }), bob);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it.each([
    ['a missing client id', { clientId: undefined }],
    ['a negative duration', { activeSeconds: -1 }],
    ['an implausible duration', { activeSeconds: 60 * 60 * 25 }],
    ['an empty workout name', { workoutName: '' }],
  ])('rejects %s', async (_label, override) => {
    const session = await signIn();

    const res = await post('/api/sessions', completedSession(override), session);

    expect(res.status).toBe(400);
  });

  it('rejects a body that is not json', async () => {
    const session = await signIn();

    const res = await SELF.fetch('https://api.test/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: session.cookie },
      body: 'not json',
    });

    expect(res.status).toBe(400);
  });
});
