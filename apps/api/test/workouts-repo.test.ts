import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/d1';
import { compileWorkout, KETTLEBELL_AND_MAT, SEED_EXERCISES } from '@kb/core';
import type { WorkoutDefinition } from '@kb/core';
import * as schema from '../src/db/schema';
import { findWorkoutDefinition, listExercises, listWorkoutsFor } from '../src/repo/workouts';

/**
 * The seed migration and the mapping back out are checked together, against
 * the same numbers the original app produced.
 *
 * This is the end-to-end version of the fidelity test in `@kb/core`: there the
 * workout was a literal in TypeScript, here it has been written to SQL, read
 * back through Drizzle and reassembled. If any of the schema, the seed or the
 * mapping loses a field, the step list stops matching.
 */

const db = drizzle(env.DB, { schema });

/**
 * Section ids are primary keys across every workout in the table, so the seed
 * scopes them by workout id. The domain's `Section.id` is only a local handle
 * and plays no part in compilation, so a round-trip is compared on everything
 * else.
 */
function withoutSectionIds(definition: WorkoutDefinition) {
  return {
    ...definition,
    sections: definition.sections.map(({ id: _id, ...rest }) => rest),
  };
}

/** Workouts are owned by real users, so a fixture needs a real user row. */
async function createUser(id: string): Promise<string> {
  const now = new Date();
  await db
    .insert(schema.user)
    .values({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
  return id;
}

/** What the original single-file app produced; see @kb/core's golden fixture. */
const ORIGINAL_STEP_COUNT = 47;
const ORIGINAL_TOTAL_SEC = 1820;

describe('the seeded catalogue', () => {
  it('has every exercise the workout needs', async () => {
    const exercises = await listExercises(db);

    expect(exercises).toHaveLength(SEED_EXERCISES.length);
    expect(exercises.map((e) => e.slug).sort()).toEqual(SEED_EXERCISES.map((e) => e.slug).sort());
  });

  it('keeps the descriptions the app shows behind "How to do it"', async () => {
    const exercises = await listExercises(db);
    const swing = exercises.find((e) => e.slug === 'swing');

    expect(swing).toEqual(SEED_EXERCISES.find((e) => e.slug === 'swing'));
  });
});

describe('reading the built-in workout back out of d1', () => {
  it('reassembles the definition it was seeded from', async () => {
    const definition = await findWorkoutDefinition(db, KETTLEBELL_AND_MAT.id);

    expect(withoutSectionIds(definition!)).toEqual(withoutSectionIds(KETTLEBELL_AND_MAT));
  });

  it('scopes stored section ids to their workout', async () => {
    const definition = await findWorkoutDefinition(db, KETTLEBELL_AND_MAT.id);

    expect(definition!.sections.map((s) => s.id)).toEqual(
      KETTLEBELL_AND_MAT.sections.map((s) => `${KETTLEBELL_AND_MAT.id}:${s.id}`),
    );
  });

  it('still compiles to the original session', async () => {
    const definition = await findWorkoutDefinition(db, KETTLEBELL_AND_MAT.id);
    const exercises = await listExercises(db);

    const run = compileWorkout(definition!, exercises);

    expect(run.steps).toHaveLength(ORIGINAL_STEP_COUNT);
    expect(run.totalSec).toBe(ORIGINAL_TOTAL_SEC);
  });

  it('produces exactly what the in-code definition produces', async () => {
    const definition = await findWorkoutDefinition(db, KETTLEBELL_AND_MAT.id);
    const exercises = await listExercises(db);

    expect(compileWorkout(definition!, exercises)).toEqual(
      compileWorkout(KETTLEBELL_AND_MAT, SEED_EXERCISES),
    );
  });

  it('returns nothing for a workout that does not exist', async () => {
    await expect(findWorkoutDefinition(db, 'no-such-workout')).resolves.toBeNull();
  });
});

describe('listing what a user can run', () => {
  it('includes the built-in templates for everyone', async () => {
    const workouts = await listWorkoutsFor(db, 'some-user-with-nothing-of-their-own');

    expect(workouts.map((w) => w.id)).toContain(KETTLEBELL_AND_MAT.id);
  });

  it('does not include another user’s workouts', async () => {
    const now = new Date();
    await createUser('alice');
    await createUser('bob');
    await db.insert(schema.workouts).values({
      id: 'private-to-alice',
      ownerUserId: 'alice',
      name: "Alice's workout",
      description: '',
      isTemplate: false,
      createdAt: now,
      updatedAt: now,
    });

    const mine = await listWorkoutsFor(db, 'bob');
    const hers = await listWorkoutsFor(db, 'alice');

    expect(mine.map((w) => w.id)).not.toContain('private-to-alice');
    expect(hers.map((w) => w.id)).toContain('private-to-alice');
  });
});
