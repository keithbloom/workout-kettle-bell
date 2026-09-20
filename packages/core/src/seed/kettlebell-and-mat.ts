import type { WorkoutDefinition } from '../types.js';

/**
 * The original 30-minute workout, expressed entirely in the section/block
 * model with no special cases.
 *
 * This is the acceptance test for the model itself: if a real workout needed
 * an escape hatch to describe, the model would be wrong. It compiles to the
 * same 47 steps as the single-file app did — see
 * `test/legacy-fidelity.test.ts`.
 *
 * One deliberate difference: where the old app ended the strength section with
 * a rest that quietly belonged to endurance, that break is now the endurance
 * section's own prep step. Same fifteen seconds, same "switch to your lighter
 * bell" prompt, but the break belongs to the section it prepares for.
 */
export const KETTLEBELL_AND_MAT: WorkoutDefinition = {
  id: 'kettlebell-and-mat',
  name: 'Kettlebell and mat',
  description:
    '30 minutes of strength, endurance and core. You need a mat and a kettlebell, ideally one heavier and one lighter.',
  sections: [
    {
      id: 'warmup',
      title: 'Warm-up',
      phase: 'warmup',
      intro:
        'Go smoothly and don’t rush. Raise your heart rate and loosen your hips, shoulders and spine.',
      blocks: [
        {
          kind: 'reps',
          prep: { durationSec: 5, hint: '' },
          estimatedSecPerItem: 75,
          items: [
            { exerciseSlug: 'catcow', reps: '10 reps' },
            { exerciseSlug: 'bridge', reps: '10 reps' },
            { exerciseSlug: 'squat', reps: '10 reps' },
            { exerciseSlug: 'inchworm', reps: '5 reps' },
          ],
        },
      ],
    },
    {
      id: 'strength',
      title: 'Strength',
      phase: 'strength',
      intro: 'Two rounds: 45 seconds of work, 15 seconds of rest per move. Use your heavier bell.',
      blocks: [
        {
          kind: 'timed_circuit',
          prep: { durationSec: 10, hint: 'Pick up your heavier bell.' },
          rounds: 2,
          workSec: 45,
          restSec: 15,
          items: [
            { exerciseSlug: 'goblet' },
            { exerciseSlug: 'row', side: 'switch-halfway', switchNoun: 'arms' },
            { exerciseSlug: 'rdl' },
            { exerciseSlug: 'press', side: 'switch-halfway', switchNoun: 'arms' },
          ],
        },
      ],
    },
    {
      id: 'endurance',
      title: 'Endurance',
      phase: 'endurance',
      intro:
        'Four rounds. Start a new round every 2 minutes and rest for whatever time is left. Use your lighter bell.',
      blocks: [
        {
          kind: 'emom',
          prep: { durationSec: 15, hint: 'Switch to your lighter bell.' },
          rounds: 4,
          intervalSec: 120,
          tasks: ['20 kettlebell swings', '10 reverse lunges (5 per leg)', '5 push-ups'],
          items: [{ exerciseSlug: 'swing' }, { exerciseSlug: 'lunge' }, { exerciseSlug: 'pushup' }],
        },
      ],
    },
    {
      id: 'core',
      title: 'Core',
      phase: 'core',
      intro: 'Two rounds. 30 seconds per move with no rest between moves.',
      blocks: [
        {
          kind: 'timed_circuit',
          prep: { durationSec: 10, hint: 'Put the bell down and get onto the mat.' },
          rounds: 2,
          items: [
            { exerciseSlug: 'plank', durationSec: 30 },
            { exerciseSlug: 'twist', durationSec: 30 },
            { exerciseSlug: 'deadbug', durationSec: 30 },
            { exerciseSlug: 'sideplank', durationSec: 15, side: 'each-side' },
          ],
        },
      ],
    },
    {
      id: 'cooldown',
      title: 'Cool-down',
      phase: 'cooldown',
      intro:
        'Hold each stretch for about 45 seconds, splitting the time between sides where needed. Breathe slowly.',
      blocks: [
        {
          kind: 'hold',
          prep: { durationSec: 10, hint: 'Slow, easy breathing.' },
          items: [
            { exerciseSlug: 'child', durationSec: 45 },
            { exerciseSlug: 'hipflex', durationSec: 30, side: 'each-side' },
            { exerciseSlug: 'hamstring', durationSec: 30, side: 'each-side' },
            { exerciseSlug: 'fig4', durationSec: 30, side: 'each-side' },
            { exerciseSlug: 'shoulder', durationSec: 30, side: 'each-side' },
          ],
        },
      ],
    },
  ],
};
