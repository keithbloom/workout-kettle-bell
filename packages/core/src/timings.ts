import type { CompiledWorkout, Segment, Step } from './types.js';

/** How long a step occupies the progress bar: real time, or the estimate. */
export function lengthOf(step: Step): number {
  return step.durationSec ?? step.estimatedSec ?? 0;
}

/**
 * Lay a step list out on a timeline: when each step starts, how long the whole
 * run is, and the runs of same-phase steps the progress bar is divided into.
 */
export function withTimings(steps: Step[]): CompiledWorkout {
  const cumulativeSec: number[] = [];
  const segments: Segment[] = [];
  let totalSec = 0;

  for (const step of steps) {
    cumulativeSec.push(totalSec);

    const length = lengthOf(step);
    const last = segments.at(-1);
    if (last && last.phase === step.phase) last.totalSec += length;
    else segments.push({ phase: step.phase, startSec: totalSec, totalSec: length });

    totalSec += length;
  }

  return { steps, cumulativeSec, totalSec, segments };
}
