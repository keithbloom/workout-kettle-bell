/**
 * Write the seed migration from the catalogue in `@kb/core`.
 *
 * The exercise list and the built-in workout are defined once, as typed data
 * the compiler already tests. This turns that data into the SQL D1 is seeded
 * with, so the database and the domain cannot disagree about what a
 * "Kettlebell swing" is.
 *
 *   pnpm db:seed:write
 *
 * Re-run it after changing the seed data, then commit the migration. The SQL
 * is idempotent, so re-applying it is safe.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KETTLEBELL_AND_MAT, SEED_EXERCISES } from '@kb/core';
import type { Block, Section } from '@kb/core';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../migrations/0001_seed_catalogue.sql');

/** SQL string literal, or NULL for anything absent. */
function lit(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${value.replace(/'/g, "''")}'`;
}

function json(value: unknown): string {
  return value === undefined ? 'NULL' : lit(JSON.stringify(value));
}

const statements: string[] = [];

statements.push('-- Exercise catalogue.');
for (const e of SEED_EXERCISES) {
  statements.push(
    `INSERT INTO exercises (slug, name, description, default_dose, equipment, tags) VALUES ` +
      `(${lit(e.slug)}, ${lit(e.name)}, ${lit(e.description)}, ${lit(e.defaultDose)}, ${json([])}, ${json([])}) ` +
      `ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, ` +
      `default_dose = excluded.default_dose;`,
  );
}

/**
 * Row ids are derived from the workout rather than random, so re-running the
 * seed updates the same rows instead of duplicating them.
 *
 * They are scoped by workout id because a section id is a primary key across
 * every workout in the table, while the domain's `Section.id` is only a local
 * handle — two users may both have a section they call "warmup".
 */
const workout = KETTLEBELL_AND_MAT;
const sectionId = (s: number) => `${workout.id}:${workout.sections[s]!.id}`;
const blockId = (s: number, b: number) => `${sectionId(s)}:b${b}`;
const itemId = (s: number, b: number, i: number) => `${blockId(s, b)}:i${i}`;

statements.push('');
statements.push('-- The built-in workout, owned by nobody so everyone can run it.');
statements.push(
  `INSERT INTO workouts (id, owner_user_id, organization_id, name, description, is_template, created_at, updated_at) ` +
    `VALUES (${lit(workout.id)}, NULL, NULL, ${lit(workout.name)}, ${lit(workout.description)}, 1, ` +
    `unixepoch(), unixepoch()) ` +
    `ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, ` +
    `updated_at = unixepoch();`,
);

workout.sections.forEach((section: Section, s: number) => {
  statements.push(
    `INSERT INTO sections (id, workout_id, position, title, phase, intro) VALUES ` +
      `(${lit(sectionId(s))}, ${lit(workout.id)}, ${s}, ${lit(section.title)}, ${lit(section.phase)}, ${lit(section.intro)}) ` +
      `ON CONFLICT(id) DO UPDATE SET title = excluded.title, phase = excluded.phase, intro = excluded.intro;`,
  );

  section.blocks.forEach((block: Block, b: number) => {
    statements.push(
      `INSERT INTO blocks (id, section_id, position, kind, rounds, work_sec, rest_sec, interval_sec, ` +
        `estimated_sec_per_item, prep_sec, prep_hint, tasks) VALUES ` +
        `(${lit(blockId(s, b))}, ${lit(sectionId(s))}, ${b}, ${lit(block.kind)}, ${lit(block.rounds)}, ` +
        `${lit(block.workSec)}, ${lit(block.restSec)}, ${lit(block.intervalSec)}, ` +
        `${lit(block.estimatedSecPerItem)}, ${lit(block.prep?.durationSec)}, ${lit(block.prep?.hint)}, ` +
        `${block.tasks ? json(block.tasks) : 'NULL'}) ` +
        `ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, rounds = excluded.rounds, ` +
        `work_sec = excluded.work_sec, rest_sec = excluded.rest_sec, interval_sec = excluded.interval_sec, ` +
        `estimated_sec_per_item = excluded.estimated_sec_per_item, prep_sec = excluded.prep_sec, ` +
        `prep_hint = excluded.prep_hint, tasks = excluded.tasks;`,
    );

    block.items.forEach((item, i) => {
      statements.push(
        `INSERT INTO block_items (id, block_id, position, exercise_slug, duration_sec, reps, side, switch_noun) ` +
          `VALUES (${lit(itemId(s, b, i))}, ${lit(blockId(s, b))}, ${i}, ${lit(item.exerciseSlug)}, ` +
          `${lit(item.durationSec)}, ${lit(item.reps)}, ${lit(item.side)}, ${lit(item.switchNoun)}) ` +
          `ON CONFLICT(id) DO UPDATE SET exercise_slug = excluded.exercise_slug, ` +
          `duration_sec = excluded.duration_sec, reps = excluded.reps, side = excluded.side, ` +
          `switch_noun = excluded.switch_noun;`,
      );
    });
  });
});

const header = [
  '-- Generated by scripts/write-seed-sql.ts from the seed data in @kb/core.',
  '-- Edit that data and re-run `pnpm db:seed:write`; do not edit this file.',
  '',
].join('\n');

writeFileSync(out, `${header}${statements.join('\n')}\n`);
console.log(`Wrote ${statements.length} statements to ${out}`);
