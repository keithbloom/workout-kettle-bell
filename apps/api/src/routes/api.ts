import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/d1';
import { z } from 'zod';
import * as schema from '../db/schema.js';
import type { Env } from '../env.js';
import { requireUser, type AuthedVars } from '../middleware/require-user.js';
import {
  canRead,
  findWorkoutDefinition,
  listExercises,
  listWorkoutsFor,
} from '../repo/workouts.js';
import { countSessionsThisWeek, listSessions, recordSession } from '../repo/sessions.js';

/**
 * Everything behind a session. Mounted under /api, with `requireUser` applied
 * to the whole router rather than route by route, so a new endpoint is private
 * by default and has to be moved out to become public.
 */
export const api = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

api.use('*', requireUser);

const db = (c: { env: Env }) => drizzle(c.env.DB, { schema });

api.get('/me', (c) => c.json({ user: c.get('user') }));

api.get('/exercises', async (c) => {
  return c.json({ exercises: await listExercises(db(c)) });
});

api.get('/workouts', async (c) => {
  return c.json({ workouts: await listWorkoutsFor(db(c), c.get('user').id) });
});

api.get('/workouts/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('user').id;

  // Checked before reading, so a workout that exists but isn't theirs is
  // indistinguishable from one that doesn't: no probing for other people's ids.
  if (!(await canRead(db(c), id, userId))) return c.json({ error: 'not found' }, 404);

  const definition = await findWorkoutDefinition(db(c), id);
  if (!definition) return c.json({ error: 'not found' }, 404);

  return c.json({ workout: definition });
});

const sessionInput = z.object({
  clientId: z.string().min(1).max(100),
  workoutId: z.string().min(1).max(200).nullable(),
  workoutName: z.string().min(1).max(200),
  /** Epoch milliseconds, as the browser records them. */
  startedAt: z.number().int().nonnegative(),
  completedAt: z.number().int().nonnegative(),
  activeSeconds: z
    .number()
    .int()
    .nonnegative()
    .max(24 * 60 * 60),
});

api.post('/sessions', async (c) => {
  const parsed = sessionInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'invalid session', issues: parsed.error.issues }, 400);
  }

  const { startedAt, completedAt, ...rest } = parsed.data;
  const record = await recordSession(db(c), c.get('user').id, {
    ...rest,
    startedAt: new Date(startedAt),
    completedAt: new Date(completedAt),
  });

  return c.json({ session: record }, 201);
});

api.get('/sessions', async (c) => {
  const userId = c.get('user').id;
  const [sessions, thisWeek] = await Promise.all([
    listSessions(db(c), userId),
    countSessionsThisWeek(db(c), userId),
  ]);

  return c.json({ sessions, thisWeek });
});
