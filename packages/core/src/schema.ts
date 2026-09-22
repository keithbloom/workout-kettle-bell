import { z } from 'zod';
import { PHASES } from './types';

/**
 * The wire contract for an authored workout.
 *
 * Shared by the API, which validates what arrives, and the builder, which
 * validates before sending — one definition of what a legal workout is, rather
 * than two that drift.
 *
 * The limits are deliberately generous but finite: they exist to stop a
 * malformed or hostile payload becoming a thousand-step session, not to police
 * how anyone trains.
 */

export const LIMITS = {
  sectionsPerWorkout: 20,
  blocksPerSection: 20,
  itemsPerBlock: 30,
  tasksPerBlock: 20,
  rounds: 50,
  /** One hour, the longest any single step may run. */
  durationSec: 60 * 60,
} as const;

const sideSchema = z.enum(['both', 'each-side', 'switch-halfway']);

const blockItemSchema = z.object({
  exerciseSlug: z.string().min(1).max(100),
  durationSec: z.number().int().positive().max(LIMITS.durationSec).optional(),
  reps: z.string().max(100).optional(),
  side: sideSchema.optional(),
  switchNoun: z.string().max(40).optional(),
});

const prepSchema = z.object({
  durationSec: z.number().int().nonnegative().max(LIMITS.durationSec),
  hint: z.string().max(300),
});

const blockSchema = z.object({
  kind: z.enum(['timed_circuit', 'reps', 'emom', 'hold']),
  items: z.array(blockItemSchema).min(1).max(LIMITS.itemsPerBlock),
  prep: prepSchema.optional(),
  rounds: z.number().int().positive().max(LIMITS.rounds).optional(),
  workSec: z.number().int().positive().max(LIMITS.durationSec).optional(),
  restSec: z.number().int().nonnegative().max(LIMITS.durationSec).optional(),
  intervalSec: z.number().int().positive().max(LIMITS.durationSec).optional(),
  tasks: z.array(z.string().min(1).max(200)).max(LIMITS.tasksPerBlock).optional(),
  estimatedSecPerItem: z.number().int().positive().max(LIMITS.durationSec).optional(),
});

const sectionSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(100),
  phase: z.enum(PHASES),
  intro: z.string().max(1000),
  blocks: z.array(blockSchema).min(1).max(LIMITS.blocksPerSection),
});

export const workoutDefinitionSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  description: z.string().max(1000),
  sections: z.array(sectionSchema).min(1).max(LIMITS.sectionsPerWorkout),
});

/** What a user may send when creating or replacing a workout: no id, we mint it. */
export const workoutDraftSchema = workoutDefinitionSchema.omit({ id: true });

export type WorkoutDraft = z.infer<typeof workoutDraftSchema>;
