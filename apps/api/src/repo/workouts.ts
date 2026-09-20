import { asc, eq, isNull, or } from 'drizzle-orm';
import type { drizzle } from 'drizzle-orm/d1';
import type { Block, BlockItem, Exercise, Prep, Section, WorkoutDefinition } from '@kb/core';
import * as schema from '../db/schema.js';

export type Db = ReturnType<typeof drizzle<typeof schema>>;

/** A row's nullable column as an optional domain field: null means "absent". */
function opt<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Build an object with the undefined entries left out, so a reassembled
 * definition compares equal to a hand-written one and round-trips cleanly.
 */
function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export interface WorkoutSummary {
  id: string;
  name: string;
  description: string;
  isTemplate: boolean;
  ownerUserId: string | null;
}

/**
 * What a user may run: the built-in templates plus their own workouts.
 *
 * The `or(isNull(...))` is the seam for groups — it widens to "or shared with a
 * group I'm in" without the callers changing.
 */
export async function listWorkoutsFor(db: Db, userId: string): Promise<WorkoutSummary[]> {
  const rows = await db
    .select({
      id: schema.workouts.id,
      name: schema.workouts.name,
      description: schema.workouts.description,
      isTemplate: schema.workouts.isTemplate,
      ownerUserId: schema.workouts.ownerUserId,
    })
    .from(schema.workouts)
    .where(or(isNull(schema.workouts.ownerUserId), eq(schema.workouts.ownerUserId, userId)))
    .orderBy(asc(schema.workouts.isTemplate), asc(schema.workouts.name));

  return rows;
}

/** Whether `userId` may read this workout: it's theirs, or it's a built-in. */
export async function canRead(db: Db, workoutId: string, userId: string): Promise<boolean> {
  const row = await db.query.workouts.findFirst({
    columns: { ownerUserId: true },
    where: eq(schema.workouts.id, workoutId),
  });

  if (!row) return false;
  return row.ownerUserId === null || row.ownerUserId === userId;
}

/**
 * Reassemble a stored workout into the domain shape the compiler takes.
 *
 * Positions are the ordering, not insertion order, so a reordered builder save
 * reads back in the order the user arranged.
 */
export async function findWorkoutDefinition(
  db: Db,
  workoutId: string,
): Promise<WorkoutDefinition | null> {
  const row = await db.query.workouts.findFirst({
    where: eq(schema.workouts.id, workoutId),
    with: {
      sections: {
        orderBy: asc(schema.sections.position),
        with: {
          blocks: {
            orderBy: asc(schema.blocks.position),
            with: { items: { orderBy: asc(schema.blockItems.position) } },
          },
        },
      },
    },
  });

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    sections: row.sections.map(toSection),
  };
}

/**
 * The shape the relational query returns. Written out rather than inferred so
 * the mapping below reads as a translation between two stated shapes: nullable
 * columns on one side, optional domain fields on the other.
 */
interface SectionRow {
  id: string;
  title: string;
  phase: string;
  intro: string;
  blocks: BlockRow[];
}

interface BlockRow {
  kind: string;
  rounds: number | null;
  workSec: number | null;
  restSec: number | null;
  intervalSec: number | null;
  estimatedSecPerItem: number | null;
  prepSec: number | null;
  prepHint: string | null;
  tasks: string[] | null;
  items: ItemRow[];
}

interface ItemRow {
  exerciseSlug: string;
  durationSec: number | null;
  reps: string | null;
  side: string | null;
  switchNoun: string | null;
}

function toSection(row: SectionRow): Section {
  return {
    id: row.id,
    title: row.title,
    phase: row.phase as Section['phase'],
    intro: row.intro,
    blocks: row.blocks.map(toBlock),
  };
}

function toBlock(row: BlockRow): Block {
  const prep: Prep | undefined =
    row.prepSec === null ? undefined : { durationSec: row.prepSec, hint: row.prepHint ?? '' };

  return compact<Block>({
    kind: row.kind as Block['kind'],
    items: row.items.map(toItem),
    prep,
    rounds: opt(row.rounds),
    workSec: opt(row.workSec),
    restSec: opt(row.restSec),
    intervalSec: opt(row.intervalSec),
    estimatedSecPerItem: opt(row.estimatedSecPerItem),
    tasks: opt(row.tasks),
  } as Block);
}

function toItem(row: ItemRow): BlockItem {
  return compact<BlockItem>({
    exerciseSlug: row.exerciseSlug,
    durationSec: opt(row.durationSec),
    reps: opt(row.reps),
    side: opt(row.side) as BlockItem['side'],
    switchNoun: opt(row.switchNoun),
  } as BlockItem);
}

/** The whole catalogue: small, stable, and needed to compile any workout. */
export async function listExercises(db: Db): Promise<Exercise[]> {
  const rows = await db
    .select({
      slug: schema.exercises.slug,
      name: schema.exercises.name,
      description: schema.exercises.description,
      defaultDose: schema.exercises.defaultDose,
    })
    .from(schema.exercises)
    .orderBy(asc(schema.exercises.name));

  return rows;
}
