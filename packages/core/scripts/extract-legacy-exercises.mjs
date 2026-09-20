/**
 * Generate the seed exercise catalogue from the original app's `M` table, so
 * the twenty moves and their descriptions carry over without transcription
 * slips.
 *
 *   node scripts/extract-legacy-exercises.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const legacy = resolve(here, '../../../legacy/index.html');
const out = resolve(here, '../src/seed/exercises.ts');

const html = readFileSync(legacy, 'utf8');
const start = html.indexOf('var M={');
const end = html.indexOf('var SECTIONS=', start);
if (start === -1 || end === -1) throw new Error('Could not locate the legacy exercise table');

const sandbox = {};
runInNewContext(`${html.slice(start, end)}\nglobalThis.__m = M;`, sandbox);

const entries = Object.entries(sandbox.__m).map(([slug, m]) => ({
  slug,
  name: m.name,
  description: m.desc,
  defaultDose: m.dose,
}));

const body = entries
  .map(
    (e) =>
      `  {\n` +
      `    slug: ${JSON.stringify(e.slug)},\n` +
      `    name: ${JSON.stringify(e.name)},\n` +
      `    defaultDose: ${JSON.stringify(e.defaultDose)},\n` +
      `    description:\n      ${JSON.stringify(e.description)},\n` +
      `  },`,
  )
  .join('\n');

writeFileSync(
  out,
  `/**\n` +
    ` * The exercise catalogue users pick from.\n` +
    ` *\n` +
    ` * Generated from the original app by scripts/extract-legacy-exercises.mjs —\n` +
    ` * edit that source, or this file directly once the legacy app is retired.\n` +
    ` */\n` +
    `import type { Exercise } from '../types.js';\n\n` +
    `export const SEED_EXERCISES: readonly Exercise[] = [\n${body}\n];\n`,
);

console.log(`Wrote ${entries.length} exercises to ${out}`);
