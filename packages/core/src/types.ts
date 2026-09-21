/**
 * The workout domain, in two halves.
 *
 * A `WorkoutDefinition` is what a user authors and what we store: sections of
 * blocks, each block naming exercises from the catalogue. It says nothing about
 * time passing.
 *
 * A `CompiledWorkout` is what the player runs: a flat list of steps with
 * durations, plus the cumulative offsets and progress segments the UI needs.
 * `compileWorkout` is the only bridge between the two, so the builder's preview
 * and the player can never disagree.
 */

/**
 * The list is the source of truth and the type is derived from it, so the Zod
 * contract can use `z.enum(PHASES)` and still infer the literal union rather
 * than widening to `string`.
 */
export const PHASES = ['warmup', 'strength', 'endurance', 'core', 'cooldown'] as const;

export type Phase = (typeof PHASES)[number];

/**
 * How an exercise is worked through.
 * - `both`           one step, both sides together (or side-agnostic)
 * - `each-side`      two steps, left then right, each of the full duration
 * - `switch-halfway` one step, with a cue to swap sides at the midpoint
 */
export type Side = 'both' | 'each-side' | 'switch-halfway';

export type BlockKind = 'timed_circuit' | 'reps' | 'emom' | 'hold';

export interface Exercise {
  slug: string;
  name: string;
  /** How to perform it, shown behind "How to do it". */
  description: string;
  /** Prescription shown when browsing, e.g. "10 reps", "45 sec". */
  defaultDose: string;
}

export interface BlockItem {
  exerciseSlug: string;
  /** Overrides the block's `workSec`. Required by `hold`, ignored by `reps`. */
  durationSec?: number;
  /** Prescription for an untimed item, e.g. "10 reps (5 per leg)". */
  reps?: string;
  /** Defaults to `both`. */
  side?: Side;
  /**
   * What gets swapped by a `switch-halfway` item — "arms" for a row or press,
   * "legs" for a lunge. Defaults to "sides".
   */
  switchNoun?: string;
}

/** Shown before a block starts, to change equipment or get into position. */
export interface Prep {
  durationSec: number;
  hint: string;
}

export interface Block {
  kind: BlockKind;
  items: BlockItem[];
  prep?: Prep;
  /** Times through `items`. Defaults to 1. */
  rounds?: number;
  /** Work time for `timed_circuit` items that don't set their own. */
  workSec?: number;
  /** Rest after each worked item. Omit or 0 for none. */
  restSec?: number;
  /** `emom` only: the fixed window each round occupies. */
  intervalSec?: number;
  /** `emom` only: the checklist a user ticks off within the interval. */
  tasks?: string[];
  /**
   * `reps` only: how long an untimed item is assumed to take. Used for the
   * progress bar and the total, never to advance the step.
   */
  estimatedSecPerItem?: number;
}

export interface Section {
  id: string;
  title: string;
  phase: Phase;
  /** Guidance shown when the section is expanded on the workout screen. */
  intro: string;
  blocks: Block[];
}

export interface WorkoutDefinition {
  id: string;
  name: string;
  description: string;
  sections: Section[];
}

/* ------------------------------ compiled ------------------------------ */

export type StepType = 'prep' | 'rest' | 'work' | 'reps' | 'emom';

/**
 * Steps carry a wider phase than sections do: the interval timer is not part
 * of any workout, but the player still colours and segments it the same way.
 */
export type StepPhase = Phase | 'interval';

export interface ExerciseDetail {
  name: string;
  description: string;
}

export interface Step {
  /** Index into `WorkoutDefinition.sections`, for "start from here". */
  sectionIndex: number;
  phase: StepPhase;
  type: StepType;
  title: string;
  /** Secondary line: the dose, or what's coming next during a rest. */
  sub?: string;
  /** Instruction for a prep or rest step, e.g. "Pick up your heavier bell." */
  hint?: string;
  /** Position label, e.g. "Round 2 of 2". */
  round?: string;
  /** Counts down. Absent for `reps` steps, which advance on a tap. */
  durationSec?: number;
  /** Assumed length of an untimed step, for progress and totals only. */
  estimatedSec?: number;
  /** `emom` only. */
  tasks?: string[];
  details: ExerciseDetail[];
  /** Short name used by the previous step's "Next: …" line. */
  label: string;
  /** What the voice says on entering the step. */
  speech: string;
  /** Announced at the midpoint of a `switch-halfway` step. */
  halfwayCue?: string;
  /** "Next: Goblet squat", or "Last one". Filled in during compilation. */
  nextText?: string;
}

/** A run of consecutive steps in the same phase, for the progress bar. */
export interface Segment {
  phase: StepPhase;
  startSec: number;
  totalSec: number;
}

export interface CompiledWorkout {
  steps: Step[];
  /** `cumulativeSec[i]` is the seconds elapsed before `steps[i]` begins. */
  cumulativeSec: number[];
  totalSec: number;
  segments: Segment[];
}

/* ------------------------------ interval timer ------------------------------ */

export interface IntervalConfig {
  workSec: number;
  restSec: number;
  rounds: number;
  prepSec: number;
}
