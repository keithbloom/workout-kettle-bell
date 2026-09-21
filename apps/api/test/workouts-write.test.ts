import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { KETTLEBELL_AND_MAT } from '@kb/core';

/**
 * Creating, editing and deleting a user's own workouts.
 *
 * The ownership rules are the point of this file: a user may read the built-in
 * templates but never change them, and must not be able to touch — or even
 * learn the existence of — anyone else's workout.
 */

interface Session {
  cookie: string;
}

let nextUser = 0;

async function signIn(): Promise<Session> {
  const n = ++nextUser;
  const res = await SELF.fetch('https://api.test/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `writer-${n}@example.com`,
      name: `Writer ${n}`,
      password: 'correct-horse-battery',
    }),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]! };
}

function send(method: string, path: string, session: Session, body?: unknown) {
  return SELF.fetch(`https://api.test${path}`, {
    method,
    headers: {
      cookie: session.cookie,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const draft = (name = 'Morning session') => ({
  name,
  description: 'Short and heavy.',
  sections: [
    {
      id: 'main',
      title: 'Main',
      phase: 'strength',
      intro: 'Use the heavy bell.',
      blocks: [
        {
          kind: 'timed_circuit',
          rounds: 3,
          workSec: 40,
          restSec: 20,
          prep: { durationSec: 10, hint: 'Pick up your bell.' },
          items: [
            { exerciseSlug: 'goblet' },
            { exerciseSlug: 'row', side: 'switch-halfway', switchNoun: 'arms' },
          ],
        },
      ],
    },
  ],
});

async function createWorkout(session: Session, name?: string): Promise<string> {
  const res = await send('POST', '/api/workouts', session, draft(name));
  expect(res.status, await res.clone().text()).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

describe('creating a workout', () => {
  it('stores it and returns it in the list', async () => {
    const session = await signIn();
    const id = await createWorkout(session, 'Morning session');

    const list = await send('GET', '/api/workouts', session);
    const { workouts } = (await list.json()) as { workouts: { id: string; name: string }[] };

    expect(workouts.find((w) => w.id === id)?.name).toBe('Morning session');
  });

  it('reads back exactly what was sent', async () => {
    const session = await signIn();
    const id = await createWorkout(session);

    const res = await send('GET', `/api/workouts/${id}`, session);
    const { workout } = (await res.json()) as { workout: Record<string, unknown> };

    const sent = draft();
    expect(workout).toMatchObject({ name: sent.name, description: sent.description });
    expect(workout.sections).toHaveLength(1);
  });

  it('keeps optional fields like the halfway switch', async () => {
    const session = await signIn();
    const id = await createWorkout(session);

    const res = await send('GET', `/api/workouts/${id}`, session);
    const { workout } = (await res.json()) as {
      workout: { sections: { blocks: { items: { switchNoun?: string }[] }[] }[] };
    };

    expect(workout.sections[0]!.blocks[0]!.items[1]).toMatchObject({
      side: 'switch-halfway',
      switchNoun: 'arms',
    });
  });

  /*
   * D1 caps a statement at 100 bound parameters, so the rows have to be
   * inserted in chunks. A workout with enough items to cross that line is the
   * regression test: before chunking, this failed with an opaque 500.
   */
  it('handles a workout with more items than fit in one statement', async () => {
    const session = await signIn();
    const big = draft('Everything');
    big.sections[0]!.blocks[0]!.items = Array.from({ length: 25 }, () => ({
      exerciseSlug: 'goblet',
    }));

    const created = await send('POST', '/api/workouts', session, big);
    expect(created.status, await created.clone().text()).toBe(201);

    const { id } = (await created.json()) as { id: string };
    const res = await send('GET', `/api/workouts/${id}`, session);
    const { workout } = (await res.json()) as {
      workout: { sections: { blocks: { items: unknown[] }[] }[] };
    };

    expect(workout.sections[0]!.blocks[0]!.items).toHaveLength(25);
  });

  it('rejects a malformed workout', async () => {
    const session = await signIn();

    const res = await send('POST', '/api/workouts', session, { name: '', sections: [] });

    expect(res.status).toBe(400);
  });
});

describe('editing a workout', () => {
  it('replaces the contents', async () => {
    const session = await signIn();
    const id = await createWorkout(session);

    const edited = draft('Renamed');
    edited.sections[0]!.blocks[0]!.rounds = 5;
    const put = await send('PUT', `/api/workouts/${id}`, session, edited);
    expect(put.status).toBe(200);

    const res = await send('GET', `/api/workouts/${id}`, session);
    const { workout } = (await res.json()) as {
      workout: { name: string; sections: { blocks: { rounds: number }[] }[] };
    };

    expect(workout.name).toBe('Renamed');
    expect(workout.sections[0]!.blocks[0]!.rounds).toBe(5);
  });

  it('leaves no orphaned sections behind when sections are removed', async () => {
    const session = await signIn();
    const id = await createWorkout(session);

    const shorter = draft();
    shorter.sections.push({ ...shorter.sections[0]!, id: 'second', title: 'Second' });
    await send('PUT', `/api/workouts/${id}`, session, shorter);
    await send('PUT', `/api/workouts/${id}`, session, draft());

    const res = await send('GET', `/api/workouts/${id}`, session);
    const { workout } = (await res.json()) as { workout: { sections: unknown[] } };

    expect(workout.sections).toHaveLength(1);
  });

  it('rejects a malformed edit without changing anything', async () => {
    const session = await signIn();
    const id = await createWorkout(session, 'Keep me');

    const res = await send('PUT', `/api/workouts/${id}`, session, { name: '', sections: [] });
    expect(res.status).toBe(400);

    const after = await send('GET', `/api/workouts/${id}`, session);
    const { workout } = (await after.json()) as { workout: { name: string } };
    expect(workout.name).toBe('Keep me');
  });
});

describe('deleting a workout', () => {
  it('removes it from the list', async () => {
    const session = await signIn();
    const id = await createWorkout(session);

    const res = await send('DELETE', `/api/workouts/${id}`, session);
    expect(res.status).toBe(204);

    const after = await send('GET', `/api/workouts/${id}`, session);
    expect(after.status).toBe(404);
  });
});

describe('copying a workout', () => {
  it('gives you your own editable copy of a built-in template', async () => {
    const session = await signIn();

    const res = await send('POST', `/api/workouts/${KETTLEBELL_AND_MAT.id}/copy`, session);
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };

    const copy = await send('GET', `/api/workouts/${id}`, session);
    const { workout } = (await copy.json()) as { workout: { name: string; sections: unknown[] } };

    expect(workout.name).toBe(`${KETTLEBELL_AND_MAT.name} (copy)`);
    expect(workout.sections).toHaveLength(KETTLEBELL_AND_MAT.sections.length);

    // And unlike the template, the copy can be edited.
    expect((await send('PUT', `/api/workouts/${id}`, session, draft())).status).toBe(200);
  });
});

describe('other people’s workouts', () => {
  it('cannot be read', async () => {
    const alice = await signIn();
    const bob = await signIn();
    const id = await createWorkout(alice);

    expect((await send('GET', `/api/workouts/${id}`, bob)).status).toBe(404);
  });

  it('cannot be edited', async () => {
    const alice = await signIn();
    const bob = await signIn();
    const id = await createWorkout(alice, 'Alice only');

    expect((await send('PUT', `/api/workouts/${id}`, bob, draft('Bob was here'))).status).toBe(404);

    const after = await send('GET', `/api/workouts/${id}`, alice);
    const { workout } = (await after.json()) as { workout: { name: string } };
    expect(workout.name).toBe('Alice only');
  });

  it('cannot be deleted', async () => {
    const alice = await signIn();
    const bob = await signIn();
    const id = await createWorkout(alice);

    expect((await send('DELETE', `/api/workouts/${id}`, bob)).status).toBe(404);
    expect((await send('GET', `/api/workouts/${id}`, alice)).status).toBe(200);
  });

  it('are not listed', async () => {
    const alice = await signIn();
    const bob = await signIn();
    const id = await createWorkout(alice);

    const list = await send('GET', '/api/workouts', bob);
    const { workouts } = (await list.json()) as { workouts: { id: string }[] };

    expect(workouts.map((w) => w.id)).not.toContain(id);
  });
});

describe('who may edit what', () => {
  it('tells you a workout of your own is editable', async () => {
    const session = await signIn();
    const id = await createWorkout(session);

    const res = await send('GET', `/api/workouts/${id}`, session);

    expect(await res.json()).toMatchObject({ canEdit: true });
  });

  it('tells you a built-in template is not', async () => {
    const session = await signIn();

    const res = await send('GET', `/api/workouts/${KETTLEBELL_AND_MAT.id}`, session);

    expect(await res.json()).toMatchObject({ canEdit: false });
  });
});

describe('the built-in template', () => {
  it('cannot be edited', async () => {
    const session = await signIn();

    const res = await send('PUT', `/api/workouts/${KETTLEBELL_AND_MAT.id}`, session, draft());

    expect(res.status).toBe(404);
  });

  it('cannot be deleted', async () => {
    const session = await signIn();

    const res = await send('DELETE', `/api/workouts/${KETTLEBELL_AND_MAT.id}`, session);

    expect(res.status).toBe(404);
  });
});
