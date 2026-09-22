import { withTimings } from './timings';
import type {
  Block,
  BlockItem,
  CompiledWorkout,
  Exercise,
  ExerciseDetail,
  Section,
  Step,
  WorkoutDefinition,
} from './types';

export interface CompileOptions {
  /** Skip every section before this index, and re-base the timings. */
  fromSectionIndex?: number;
}

/** Assumed length of an untimed step when a `reps` block doesn't say. */
const DEFAULT_REPS_ESTIMATE_SEC = 60;

export class UnknownExerciseError extends Error {
  constructor(readonly slug: string) {
    super(`Unknown exercise: ${slug}`);
    this.name = 'UnknownExerciseError';
  }
}

/**
 * Turn an authored workout into the flat step list the player runs.
 *
 * Pure, and the single source of truth for how long a workout takes — the
 * builder's live total calls this too, so a preview cannot drift from the
 * session a user actually gets.
 */
export function compileWorkout(
  definition: WorkoutDefinition,
  catalogue: readonly Exercise[],
  options: CompileOptions = {},
): CompiledWorkout {
  const lookup = new Map(catalogue.map((e) => [e.slug, e]));
  const from = options.fromSectionIndex ?? 0;

  const steps: Step[] = [];
  definition.sections.forEach((section, sectionIndex) => {
    if (sectionIndex < from) return;
    for (const block of section.blocks) {
      steps.push(...expandBlock(block, section, sectionIndex, lookup));
    }
  });

  addLookAhead(steps);
  return withTimings(steps);
}

/* ------------------------------ expansion ------------------------------ */

/** One worked step's worth of an item: an item plus which side it works. */
type Effort = { item: BlockItem; side: 'both' | 'left' | 'right' | 'switch' };

function expandSides(item: BlockItem): Effort[] {
  if (item.side === 'each-side') {
    return [
      { item, side: 'left' },
      { item, side: 'right' },
    ];
  }
  return [{ item, side: item.side === 'switch-halfway' ? 'switch' : 'both' }];
}

function expandBlock(
  block: Block,
  section: Section,
  sectionIndex: number,
  lookup: ReadonlyMap<string, Exercise>,
): Step[] {
  const steps: Step[] = [];
  const rounds = block.rounds ?? 1;

  if (block.prep) {
    steps.push({
      sectionIndex,
      phase: section.phase,
      type: 'prep',
      title: 'Get ready',
      durationSec: block.prep.durationSec,
      hint: block.prep.hint,
      details: [],
      label: 'Get ready',
      speech: 'Get ready',
    });
  }

  if (block.kind === 'emom') {
    const details = block.items.map((item) => detailOf(item, lookup));
    const intervalSec = block.intervalSec ?? 60;
    for (let round = 1; round <= rounds; round++) {
      steps.push({
        sectionIndex,
        phase: section.phase,
        type: 'emom',
        title: `Round ${round} of ${rounds}`,
        sub: 'Tap each line when you finish it.',
        round: `A new round every ${describeInterval(intervalSec)}`,
        durationSec: intervalSec,
        ...(block.tasks ? { tasks: block.tasks } : {}),
        details,
        label: `Round ${round} of ${rounds}`,
        speech: `Round ${round}`,
      });
    }
    return steps;
  }

  const efforts = block.items.flatMap(expandSides);
  const noun = block.kind === 'hold' ? 'Stretch' : 'Move';
  const restSec = block.restSec ?? 0;

  for (let round = 1; round <= rounds; round++) {
    efforts.forEach((effort, index) => {
      const exercise = exerciseOf(effort.item, lookup);
      const roundLabel =
        rounds > 1 ? `Round ${round} of ${rounds}` : `${noun} ${index + 1} of ${efforts.length}`;

      steps.push(
        block.kind === 'reps'
          ? repsStep(effort, exercise, block, section, sectionIndex, roundLabel)
          : workStep(effort, exercise, block, section, sectionIndex, roundLabel),
      );

      const isLast = round === rounds && index === efforts.length - 1;
      if (restSec > 0 && !isLast) {
        steps.push({
          sectionIndex,
          phase: section.phase,
          type: 'rest',
          title: 'Rest',
          round: roundLabel,
          durationSec: restSec,
          details: [],
          label: 'Rest',
          speech: 'Rest',
        });
      }
    });
  }

  return steps;
}

function repsStep(
  effort: Effort,
  exercise: Exercise,
  block: Block,
  section: Section,
  sectionIndex: number,
  roundLabel: string,
): Step {
  const label = labelFor(exercise, effort.side);
  return {
    sectionIndex,
    phase: section.phase,
    type: 'reps',
    title: exercise.name,
    sub: effort.item.reps ?? exercise.defaultDose,
    round: roundLabel,
    estimatedSec: block.estimatedSecPerItem ?? DEFAULT_REPS_ESTIMATE_SEC,
    details: [{ name: exercise.name, description: exercise.description }],
    label,
    speech: label,
  };
}

function workStep(
  effort: Effort,
  exercise: Exercise,
  block: Block,
  section: Section,
  sectionIndex: number,
  roundLabel: string,
): Step {
  const durationSec = effort.item.durationSec ?? block.workSec ?? 0;
  const label = labelFor(exercise, effort.side);
  return {
    sectionIndex,
    phase: section.phase,
    type: 'work',
    title: exercise.name,
    sub: describeEffort(effort.side, durationSec, switchNoun(effort.item)),
    round: roundLabel,
    durationSec,
    details: [{ name: exercise.name, description: exercise.description }],
    label,
    speech: label,
    ...(effort.side === 'switch' ? { halfwayCue: `Switch ${switchNoun(effort.item)}` } : {}),
  };
}

function labelFor(exercise: Exercise, side: Effort['side']): string {
  if (side === 'left') return `${exercise.name}, left side`;
  if (side === 'right') return `${exercise.name}, right side`;
  return exercise.name;
}

function switchNoun(item: BlockItem): string {
  return item.switchNoun ?? 'sides';
}

function describeEffort(side: Effort['side'], durationSec: number, noun: string): string {
  if (side === 'left') return `Left side, ${durationSec} seconds`;
  if (side === 'right') return `Right side, ${durationSec} seconds`;
  if (side === 'switch') return `${durationSec} seconds, switch ${noun} halfway`;
  return `${durationSec} seconds`;
}

function describeInterval(sec: number): string {
  if (sec % 60 === 0) {
    const mins = sec / 60;
    return mins === 1 ? '1 minute' : `${mins} minutes`;
  }
  return `${sec} seconds`;
}

function exerciseOf(item: BlockItem, lookup: ReadonlyMap<string, Exercise>): Exercise {
  const exercise = lookup.get(item.exerciseSlug);
  if (!exercise) throw new UnknownExerciseError(item.exerciseSlug);
  return exercise;
}

function detailOf(item: BlockItem, lookup: ReadonlyMap<string, Exercise>): ExerciseDetail {
  const exercise = exerciseOf(item, lookup);
  return { name: exercise.name, description: exercise.description };
}

/* ------------------------------ look-ahead ------------------------------ */

const WORKING: ReadonlySet<Step['type']> = new Set(['work', 'emom', 'reps']);

/**
 * Give every step a view of what comes next: a working step gets a "Next: …"
 * line, and a rest or prep borrows the upcoming exercise's name and details so
 * a user can read up during the break.
 */
function addLookAhead(steps: Step[]): void {
  steps.forEach((step, i) => {
    const next = steps.slice(i + 1).find((s) => WORKING.has(s.type));

    if (step.type === 'rest' || step.type === 'prep') {
      const opener = step.type === 'rest' ? 'Rest' : 'Get ready';
      if (next) {
        step.sub = `Next: ${next.label}`;
        step.details = next.details;
        step.speech = `${opener}. Next, ${next.label}`;
      } else {
        delete step.sub;
        step.speech = opener;
      }
    } else {
      step.nextText = next ? `Next: ${next.label}` : 'Last one';
    }
  });
}
