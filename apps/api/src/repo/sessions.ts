import { and, desc, eq, gte } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { Db } from './workouts';

export interface SessionInput {
  /** Minted on the device before the run, so a replayed sync is a no-op. */
  clientId: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: Date;
  completedAt: Date;
  activeSeconds: number;
}

export interface SessionRecord extends SessionInput {
  id: string;
}

/**
 * Record a completed run, or quietly update the one already recorded under the
 * same `clientId`.
 *
 * The offline outbox may flush the same session more than once — a retry after
 * a dropped response, or two tabs syncing at once — so this has to be safe to
 * repeat rather than merely unlikely to be repeated.
 */
export async function recordSession(
  db: Db,
  userId: string,
  input: SessionInput,
): Promise<SessionRecord> {
  const id = `${userId}:${input.clientId}`;

  await db
    .insert(schema.workoutSessions)
    .values({ id, userId, ...input })
    .onConflictDoUpdate({
      target: [schema.workoutSessions.userId, schema.workoutSessions.clientId],
      set: {
        workoutId: input.workoutId,
        workoutName: input.workoutName,
        startedAt: input.startedAt,
        completedAt: input.completedAt,
        activeSeconds: input.activeSeconds,
      },
    });

  return { id, ...input };
}

export async function listSessions(db: Db, userId: string, limit = 100): Promise<SessionRecord[]> {
  return db
    .select({
      id: schema.workoutSessions.id,
      clientId: schema.workoutSessions.clientId,
      workoutId: schema.workoutSessions.workoutId,
      workoutName: schema.workoutSessions.workoutName,
      startedAt: schema.workoutSessions.startedAt,
      completedAt: schema.workoutSessions.completedAt,
      activeSeconds: schema.workoutSessions.activeSeconds,
    })
    .from(schema.workoutSessions)
    .where(eq(schema.workoutSessions.userId, userId))
    .orderBy(desc(schema.workoutSessions.completedAt))
    .limit(limit);
}

/** Monday as the first day, matching the "sessions this week" line in the app. */
export function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export async function countSessionsThisWeek(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const rows = await db
    .select({ id: schema.workoutSessions.id })
    .from(schema.workoutSessions)
    .where(
      and(
        eq(schema.workoutSessions.userId, userId),
        gte(schema.workoutSessions.completedAt, startOfWeek(now)),
      ),
    );

  return rows.length;
}
