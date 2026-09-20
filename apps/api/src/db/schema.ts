/**
 * The application schema.
 *
 * Mirrors the authored side of `@kb/core`'s domain: a workout owns sections,
 * a section owns blocks, a block owns items that name exercises. Reading a
 * workout reassembles a `WorkoutDefinition`, which the shared compiler turns
 * into the step list the player runs.
 *
 * `organizationId` is deliberately present and unused: it is the seam for the
 * later groups feature, so adding sharing needs no migration of existing rows.
 */
import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema.js';

export * from './auth-schema.js';

/**
 * The curated catalogue. Admin-owned: users compose workouts from these, they
 * don't invent exercises, so descriptions and safety cues stay trustworthy.
 */
export const exercises = sqliteTable('exercises', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  defaultDose: text('default_dose').notNull(),
  /** JSON array, e.g. ["kettlebell","mat"]. Used to filter the picker. */
  equipment: text('equipment', { mode: 'json' }).$type<string[]>().notNull().default([]),
  /** JSON array of muscle-group tags, e.g. ["glutes","hamstrings"]. */
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
});

export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    /** Null for the built-in templates everyone can run. */
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'cascade' }),
    /** Reserved for the groups feature; always null for now. */
    organizationId: text('organization_id'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    isTemplate: integer('is_template', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('workouts_owner_idx').on(t.ownerUserId)],
);

export const sections = sqliteTable(
  'sections',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    /** One of core's `Phase` values; drives the player's colour and grouping. */
    phase: text('phase').notNull(),
    intro: text('intro').notNull().default(''),
  },
  (t) => [uniqueIndex('sections_workout_position_idx').on(t.workoutId, t.position)],
);

export const blocks = sqliteTable(
  'blocks',
  {
    id: text('id').primaryKey(),
    sectionId: text('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    /** One of core's `BlockKind` values. */
    kind: text('kind').notNull(),
    rounds: integer('rounds'),
    workSec: integer('work_sec'),
    restSec: integer('rest_sec'),
    intervalSec: integer('interval_sec'),
    estimatedSecPerItem: integer('estimated_sec_per_item'),
    prepSec: integer('prep_sec'),
    prepHint: text('prep_hint'),
    /** JSON array of checklist lines, for `emom` blocks. */
    tasks: text('tasks', { mode: 'json' }).$type<string[]>(),
  },
  (t) => [uniqueIndex('blocks_section_position_idx').on(t.sectionId, t.position)],
);

export const blockItems = sqliteTable(
  'block_items',
  {
    id: text('id').primaryKey(),
    blockId: text('block_id')
      .notNull()
      .references(() => blocks.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    exerciseSlug: text('exercise_slug')
      .notNull()
      .references(() => exercises.slug, { onDelete: 'restrict' }),
    durationSec: integer('duration_sec'),
    reps: text('reps'),
    /** One of core's `Side` values; null means `both`. */
    side: text('side'),
    switchNoun: text('switch_noun'),
  },
  (t) => [uniqueIndex('block_items_block_position_idx').on(t.blockId, t.position)],
);

/**
 * A completed run. `clientId` is minted on the device before the session
 * starts, so an offline queue can be flushed more than once without creating
 * duplicates — the upsert keys on it.
 */
export const workoutSessions = sqliteTable(
  'workout_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Kept if the workout is later deleted, so history doesn't vanish. */
    workoutId: text('workout_id').references(() => workouts.id, { onDelete: 'set null' }),
    workoutName: text('workout_name').notNull(),
    clientId: text('client_id').notNull(),
    startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
    completedAt: integer('completed_at', { mode: 'timestamp' }).notNull(),
    activeSeconds: integer('active_seconds').notNull(),
  },
  (t) => [
    uniqueIndex('workout_sessions_user_client_idx').on(t.userId, t.clientId),
    index('workout_sessions_user_completed_idx').on(t.userId, t.completedAt),
  ],
);

/* ------------------------------ relations ------------------------------ */

export const workoutsRelations = relations(workouts, ({ many }) => ({
  sections: many(sections),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  workout: one(workouts, { fields: [sections.workoutId], references: [workouts.id] }),
  blocks: many(blocks),
}));

export const blocksRelations = relations(blocks, ({ one, many }) => ({
  section: one(sections, { fields: [blocks.sectionId], references: [sections.id] }),
  items: many(blockItems),
}));

export const blockItemsRelations = relations(blockItems, ({ one }) => ({
  block: one(blocks, { fields: [blockItems.blockId], references: [blocks.id] }),
  exercise: one(exercises, { fields: [blockItems.exerciseSlug], references: [exercises.slug] }),
}));
