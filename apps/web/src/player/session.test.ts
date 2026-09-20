import { describe, expect, it } from 'vitest';
import { compileInterval, compileWorkout } from '@kb/core';
import type { CompiledWorkout, Exercise } from '@kb/core';
import {
  advance,
  back,
  currentStep,
  isRestTone,
  next,
  secondsRemaining,
  startSession,
  toggleTask,
  togglePause,
  type SessionEvent,
} from './session.js';

const T0 = 1_000_000;

const catalogue: Exercise[] = [
  { slug: 'goblet', name: 'Goblet squat', description: 'Hold it high.', defaultDose: '45 sec' },
  { slug: 'row', name: 'Bent-over row', description: 'Flat back.', defaultDose: '45 sec' },
  { slug: 'squat', name: 'Bodyweight squat', description: 'Sit back.', defaultDose: '10 reps' },
];

/** Work 10s, rest 5s, work 10s. */
function timedRun(): CompiledWorkout {
  return compileWorkout(
    {
      id: 'w',
      name: 'W',
      description: '',
      sections: [
        {
          id: 's',
          title: 'S',
          phase: 'strength',
          intro: '',
          blocks: [
            {
              kind: 'timed_circuit',
              workSec: 10,
              restSec: 5,
              items: [{ exerciseSlug: 'goblet' }, { exerciseSlug: 'row' }],
            },
          ],
        },
      ],
    },
    catalogue,
  );
}

/** One untimed reps step, then a timed one. */
function repsRun(): CompiledWorkout {
  return compileWorkout(
    {
      id: 'w',
      name: 'W',
      description: '',
      sections: [
        {
          id: 'a',
          title: 'A',
          phase: 'warmup',
          intro: '',
          blocks: [{ kind: 'reps', estimatedSecPerItem: 30, items: [{ exerciseSlug: 'squat' }] }],
        },
        {
          id: 'b',
          title: 'B',
          phase: 'strength',
          intro: '',
          blocks: [{ kind: 'timed_circuit', workSec: 10, items: [{ exerciseSlug: 'goblet' }] }],
        },
      ],
    },
    catalogue,
  );
}

function emomRun(): CompiledWorkout {
  return compileWorkout(
    {
      id: 'w',
      name: 'W',
      description: '',
      sections: [
        {
          id: 'e',
          title: 'E',
          phase: 'endurance',
          intro: '',
          blocks: [
            {
              kind: 'emom',
              rounds: 2,
              intervalSec: 60,
              tasks: ['20 swings', '10 lunges'],
              items: [{ exerciseSlug: 'goblet' }],
            },
          ],
        },
      ],
    },
    catalogue,
  );
}

const kinds = (events: SessionEvent[]) => events.map((e) => e.type);

describe('starting a session', () => {
  it('begins on the first step', () => {
    const state = startSession(timedRun(), T0).state;

    expect(currentStep(state)?.title).toBe('Goblet squat');
    expect(state.finished).toBe(false);
  });

  it('announces the first step', () => {
    const { events } = startSession(timedRun(), T0);

    expect(kinds(events)).toContain('enter-step');
  });

  it('shows the full duration before any time passes', () => {
    const state = startSession(timedRun(), T0).state;

    expect(secondsRemaining(state, T0)).toBe(10);
  });
});

describe('a timed step', () => {
  it('counts down', () => {
    const state = startSession(timedRun(), T0).state;

    expect(secondsRemaining(state, T0 + 3_000)).toBe(7);
  });

  it('rounds up, so the clock only shows zero when it is over', () => {
    const state = startSession(timedRun(), T0).state;

    expect(secondsRemaining(state, T0 + 9_500)).toBe(1);
    expect(secondsRemaining(state, T0 + 10_000)).toBe(0);
  });

  it('moves on by itself when the time runs out', () => {
    const state = startSession(timedRun(), T0).state;

    const { state: after } = advance(state, T0 + 10_000);

    expect(currentStep(after)?.type).toBe('rest');
  });

  it('stays put while there is time left', () => {
    const state = startSession(timedRun(), T0).state;

    const { state: after } = advance(state, T0 + 9_000);

    expect(currentStep(after)?.title).toBe('Goblet squat');
  });

  it('carries overshoot into the next step, so a slow tick does not add time', () => {
    const state = startSession(timedRun(), T0).state;

    // A tick that arrives 2s late: the rest should already be 2s in.
    const { state: after } = advance(state, T0 + 12_000);

    expect(secondsRemaining(after, T0 + 12_000)).toBe(3);
  });

  it('beeps for each of the last three seconds', () => {
    let state = startSession(timedRun(), T0).state;
    const counts: number[] = [];

    for (let ms = 100; ms <= 10_000; ms += 100) {
      const result = advance(state, T0 + ms);
      state = result.state;
      for (const event of result.events) {
        if (event.type === 'countdown') counts.push(event.secondsLeft);
      }
    }

    expect(counts).toEqual([3, 2, 1]);
  });

  it('does not count down a step too short to count down', () => {
    const run = compileInterval({ workSec: 3, restSec: 0, rounds: 1, prepSec: 0 });
    let state = startSession(run, T0).state;
    const counts: number[] = [];

    for (let ms = 100; ms <= 3_000; ms += 100) {
      const result = advance(state, T0 + ms);
      state = result.state;
      for (const event of result.events) {
        if (event.type === 'countdown') counts.push(event.secondsLeft);
      }
    }

    expect(counts).toEqual([]);
  });

  it('cues the halfway switch once', () => {
    const run = compileWorkout(
      {
        id: 'w',
        name: 'W',
        description: '',
        sections: [
          {
            id: 's',
            title: 'S',
            phase: 'strength',
            intro: '',
            blocks: [
              {
                kind: 'timed_circuit',
                items: [
                  {
                    exerciseSlug: 'row',
                    durationSec: 10,
                    side: 'switch-halfway',
                    switchNoun: 'arms',
                  },
                ],
              },
            ],
          },
        ],
      },
      catalogue,
    );

    let state = startSession(run, T0).state;
    const cues: string[] = [];
    for (let ms = 100; ms <= 9_000; ms += 100) {
      const result = advance(state, T0 + ms);
      state = result.state;
      for (const event of result.events) {
        if (event.type === 'halfway') cues.push(event.cue);
      }
    }

    expect(cues).toEqual(['Switch arms']);
  });
});

describe('an untimed reps step', () => {
  it('never advances on its own', () => {
    const state = startSession(repsRun(), T0).state;

    const { state: after } = advance(state, T0 + 10 * 60_000);

    expect(currentStep(after)?.type).toBe('reps');
  });

  it('advances when the user says it is done', () => {
    const state = startSession(repsRun(), T0).state;

    const { state: after } = next(state, T0 + 20_000);

    expect(currentStep(after)?.title).toBe('Goblet squat');
  });

  it('has no clock to show', () => {
    const state = startSession(repsRun(), T0).state;

    expect(secondsRemaining(state, T0 + 5_000)).toBeNull();
  });
});

describe('pausing', () => {
  it('freezes the clock', () => {
    let state = startSession(timedRun(), T0).state;
    state = togglePause(state, T0 + 4_000).state;

    expect(secondsRemaining(state, T0 + 9_000)).toBe(6);
  });

  it('does not advance while paused', () => {
    let state = startSession(timedRun(), T0).state;
    state = togglePause(state, T0 + 4_000).state;

    const { state: after } = advance(state, T0 + 60_000);

    expect(currentStep(after)?.title).toBe('Goblet squat');
  });

  it('gives back the time spent paused on resume', () => {
    let state = startSession(timedRun(), T0).state;
    state = togglePause(state, T0 + 4_000).state;
    state = togglePause(state, T0 + 20_000).state;

    // 4s elapsed before the pause, so 6s should remain.
    expect(secondsRemaining(state, T0 + 20_000)).toBe(6);
  });

  it('does not count paused time as active', () => {
    let state = startSession(timedRun(), T0).state;
    state = advance(state, T0 + 4_000).state;
    state = togglePause(state, T0 + 4_000).state;
    state = togglePause(state, T0 + 24_000).state;
    state = advance(state, T0 + 25_000).state;

    expect(Math.round(state.activeMs / 1000)).toBe(5);
  });
});

describe('skipping back', () => {
  it('restarts the current step when it is already under way', () => {
    let state = startSession(timedRun(), T0).state;
    state = advance(state, T0 + 6_000).state;

    const { state: after } = back(state, T0 + 6_000);

    expect(currentStep(after)?.title).toBe('Goblet squat');
    expect(secondsRemaining(after, T0 + 6_000)).toBe(10);
  });

  it('goes to the previous step when the current one just started', () => {
    let state = startSession(timedRun(), T0).state;
    state = next(state, T0 + 1_000).state;

    const { state: after } = back(state, T0 + 2_000);

    expect(currentStep(after)?.title).toBe('Goblet squat');
  });

  it('stays on the first step rather than going nowhere', () => {
    const state = startSession(timedRun(), T0).state;

    const { state: after } = back(state, T0 + 500);

    expect(after.index).toBe(0);
  });
});

describe('an emom round', () => {
  it('shows the checklist', () => {
    const state = startSession(emomRun(), T0).state;

    expect(currentStep(state)?.tasks).toEqual(['20 swings', '10 lunges']);
  });

  it('switches to a rest tone once every task is ticked', () => {
    let state = startSession(emomRun(), T0).state;

    state = toggleTask(state, 0, T0 + 5_000).state;
    expect(isRestTone(state)).toBe(false);

    state = toggleTask(state, 1, T0 + 9_000).state;
    expect(isRestTone(state)).toBe(true);
  });

  it('still runs for the full interval once the work is done', () => {
    let state = startSession(emomRun(), T0).state;
    state = toggleTask(state, 0, T0 + 5_000).state;
    state = toggleTask(state, 1, T0 + 9_000).state;

    const { state: after } = advance(state, T0 + 30_000);

    expect(currentStep(after)?.title).toBe('Round 1 of 2');
    expect(secondsRemaining(after, T0 + 30_000)).toBe(30);
  });

  it('clears the ticks for the next round', () => {
    let state = startSession(emomRun(), T0).state;
    state = toggleTask(state, 0, T0 + 5_000).state;
    state = advance(state, T0 + 60_000).state;

    expect(state.ticks).toEqual([]);
    expect(isRestTone(state)).toBe(false);
  });

  it('lets a mis-tap be undone', () => {
    let state = startSession(emomRun(), T0).state;
    state = toggleTask(state, 0, T0 + 1_000).state;
    state = toggleTask(state, 0, T0 + 2_000).state;

    expect(state.ticks[0]).toBeFalsy();
  });
});

describe('finishing', () => {
  it('ends after the last step', () => {
    let state = startSession(timedRun(), T0).state;
    state = next(state, T0 + 1_000).state;
    state = next(state, T0 + 2_000).state;

    const { state: after, events } = next(state, T0 + 3_000);

    expect(after.finished).toBe(true);
    expect(kinds(events)).toContain('finished');
  });

  it('reports how long was actually spent working', () => {
    let state = startSession(timedRun(), T0).state;
    state = advance(state, T0 + 10_000).state;
    state = advance(state, T0 + 15_000).state;

    const { events } = advance(state, T0 + 25_000);
    const finished = events.find((e) => e.type === 'finished');

    expect(finished).toMatchObject({ activeSeconds: 25 });
  });

  it('does not run past the end', () => {
    let state = startSession(timedRun(), T0).state;
    state = advance(state, T0 + 100_000).state;

    expect(state.finished).toBe(true);
    expect(state.index).toBe(state.run.steps.length - 1);
  });
});

describe('the interval timer', () => {
  it('runs the same way a workout does', () => {
    const run = compileInterval({ workSec: 20, restSec: 10, rounds: 2, prepSec: 5 });
    let state = startSession(run, T0).state;

    expect(currentStep(state)?.title).toBe('Get ready');
    state = advance(state, T0 + 5_000).state;
    expect(currentStep(state)?.title).toBe('Work');
    state = advance(state, T0 + 25_000).state;
    expect(currentStep(state)?.title).toBe('Rest');
  });

  it('treats prep and rest as rest', () => {
    const run = compileInterval({ workSec: 20, restSec: 10, rounds: 2, prepSec: 5 });
    const state = startSession(run, T0).state;

    expect(isRestTone(state)).toBe(true);
  });
});
