import { withTimings } from './timings.js';
import type { CompiledWorkout, IntervalConfig, Step } from './types.js';

/**
 * Turn interval-timer settings into the same step list the workout player
 * runs, so both share one player, one progress bar and one set of cues.
 *
 * Unlike a workout there is nothing to look ahead to — every round is the
 * same — so each step states its own position instead.
 */
export function compileInterval(config: IntervalConfig): CompiledWorkout {
  const { workSec, restSec, rounds, prepSec } = config;
  const steps: Step[] = [];

  if (prepSec > 0) {
    steps.push({
      sectionIndex: 0,
      phase: 'interval',
      type: 'prep',
      title: 'Get ready',
      sub: 'Round 1 starts soon',
      durationSec: prepSec,
      details: [],
      label: 'Get ready',
      speech: 'Get ready',
    });
  }

  for (let round = 1; round <= rounds; round++) {
    const roundLabel = `Round ${round} of ${rounds}`;

    steps.push({
      sectionIndex: 0,
      phase: 'interval',
      type: 'work',
      title: 'Work',
      sub: `${workSec} seconds`,
      round: roundLabel,
      durationSec: workSec,
      details: [],
      label: 'Work',
      speech: 'Work',
    });

    if (round < rounds && restSec > 0) {
      steps.push({
        sectionIndex: 0,
        phase: 'interval',
        type: 'rest',
        title: 'Rest',
        sub: `Next: round ${round + 1}`,
        round: roundLabel,
        durationSec: restSec,
        details: [],
        label: 'Rest',
        speech: 'Rest',
      });
    }
  }

  return withTimings(steps);
}
