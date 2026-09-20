/**
 * Generate the golden file the port is checked against.
 *
 * Slices the data tables and the step builder straight out of the original
 * single-file app, runs them, and writes the step list they produce. Nothing
 * here is hand-written, so the fixture is the old app's real behaviour rather
 * than our memory of it.
 *
 *   node scripts/extract-legacy-steps.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const legacy = resolve(here, '../../../legacy/index.html');
const out = resolve(here, '../test/fixtures/legacy-steps.json');

const html = readFileSync(legacy, 'utf8');

/** Take the source between two markers, keeping the opening one. */
function slice(from, to) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start);
  if (start === -1 || end === -1) {
    throw new Error(`Could not locate legacy source between "${from}" and "${to}"`);
  }
  return html.slice(start, end);
}

const source = [
  slice('var M={', 'var PH='),
  slice('function dm(k){', '/* ================= player'),
  'globalThis.__run = buildWorkout(0);',
].join('\n');

const sandbox = {};
runInNewContext(source, sandbox);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(sandbox.__run, null, 2)}\n`);

console.log(`Wrote ${sandbox.__run.steps.length} steps (${sandbox.__run.total}s) to ${out}`);
