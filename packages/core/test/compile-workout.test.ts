import { describe, expect, it } from 'vitest';
import { compileWorkout } from '../src/compile-workout.js';
import type { Block, Exercise, Section, WorkoutDefinition } from '../src/types.js';

const catalogue: Exercise[] = [
  {
    slug: 'squat',
    name: 'Bodyweight squat',
    description: 'Sit back and down.',
    defaultDose: '10 reps',
  },
  {
    slug: 'bridge',
    name: 'Glute bridge',
    description: 'Push through your heels.',
    defaultDose: '10 reps',
  },
  {
    slug: 'goblet',
    name: 'Goblet squat',
    description: 'Hold the bell at your chest.',
    defaultDose: '45 sec',
  },
  {
    slug: 'row',
    name: 'Bent-over row',
    description: 'Pull the bell to your hip.',
    defaultDose: '45 sec',
  },
  {
    slug: 'swing',
    name: 'Kettlebell swing',
    description: 'Snap your hips forward.',
    defaultDose: '20 reps',
  },
  {
    slug: 'sideplank',
    name: 'Side plank',
    description: 'Lift your hips.',
    defaultDose: '15 sec per side',
  },
  {
    slug: 'child',
    name: "Child's pose",
    description: 'Sit your hips back.',
    defaultDose: '45 sec',
  },
  {
    slug: 'hipflex',
    name: 'Hip flexor stretch',
    description: 'Tuck your pelvis under.',
    defaultDose: '30 sec per side',
  },
];

/** A workout of one section wrapping `blocks`, so tests can stay small. */
function workoutOf(blocks: Block[], phase: Section['phase'] = 'strength'): WorkoutDefinition {
  return {
    id: 'w1',
    name: 'Test workout',
    description: '',
    sections: [{ id: 's1', title: 'Section', phase, intro: '', blocks }],
  };
}

describe('compileWorkout', () => {
  describe('reps blocks', () => {
    const block: Block = {
      kind: 'reps',
      estimatedSecPerItem: 75,
      items: [
        { exerciseSlug: 'squat', reps: '10 reps' },
        { exerciseSlug: 'bridge', reps: '10 reps' },
      ],
    };

    it('emits one untimed step per item', () => {
      const { steps } = compileWorkout(workoutOf([block], 'warmup'), catalogue);

      expect(steps).toHaveLength(2);
      expect(steps[0]).toMatchObject({
        type: 'reps',
        phase: 'warmup',
        title: 'Bodyweight squat',
        sub: '10 reps',
        estimatedSec: 75,
      });
      expect(steps[0]?.durationSec).toBeUndefined();
    });

    it('labels each item by its position in the block', () => {
      const { steps } = compileWorkout(workoutOf([block], 'warmup'), catalogue);

      expect(steps.map((s) => s.round)).toEqual(['Move 1 of 2', 'Move 2 of 2']);
    });

    it('attaches the exercise description as the step detail', () => {
      const { steps } = compileWorkout(workoutOf([block], 'warmup'), catalogue);

      expect(steps[0]?.details).toEqual([
        { name: 'Bodyweight squat', description: 'Sit back and down.' },
      ]);
    });
  });

  describe('timed circuits', () => {
    const block: Block = {
      kind: 'timed_circuit',
      rounds: 2,
      workSec: 45,
      restSec: 15,
      items: [{ exerciseSlug: 'goblet' }, { exerciseSlug: 'row' }],
    };

    it('repeats the items for each round', () => {
      const { steps } = compileWorkout(workoutOf([block]), catalogue);

      expect(steps.filter((s) => s.type === 'work').map((s) => s.title)).toEqual([
        'Goblet squat',
        'Bent-over row',
        'Goblet squat',
        'Bent-over row',
      ]);
    });

    it('rests after every worked item except the last', () => {
      const { steps } = compileWorkout(workoutOf([block]), catalogue);

      expect(steps.map((s) => s.type)).toEqual([
        'work',
        'rest',
        'work',
        'rest',
        'work',
        'rest',
        'work',
      ]);
      expect(steps[1]).toMatchObject({ type: 'rest', title: 'Rest', durationSec: 15 });
    });

    it('labels steps by round when there is more than one', () => {
      const { steps } = compileWorkout(workoutOf([block]), catalogue);

      expect(steps[0]?.round).toBe('Round 1 of 2');
      expect(steps[4]?.round).toBe('Round 2 of 2');
    });

    it('omits rest steps when no rest is configured', () => {
      const noRest: Block = { ...block, restSec: 0 };
      const { steps } = compileWorkout(workoutOf([noRest]), catalogue);

      expect(steps.every((s) => s.type === 'work')).toBe(true);
      expect(steps).toHaveLength(4);
    });

    it('lets an item override the block work time', () => {
      const mixed: Block = {
        kind: 'timed_circuit',
        workSec: 45,
        items: [{ exerciseSlug: 'goblet' }, { exerciseSlug: 'row', durationSec: 20 }],
      };
      const { steps } = compileWorkout(workoutOf([mixed]), catalogue);

      expect(steps.map((s) => s.durationSec)).toEqual([45, 20]);
    });
  });

  describe('sides', () => {
    it('expands an each-side item into a left and a right step', () => {
      const block: Block = {
        kind: 'timed_circuit',
        items: [{ exerciseSlug: 'sideplank', durationSec: 15, side: 'each-side' }],
      };
      const { steps } = compileWorkout(workoutOf([block], 'core'), catalogue);

      expect(steps).toHaveLength(2);
      expect(steps[0]).toMatchObject({
        title: 'Side plank',
        sub: 'Left side, 15 seconds',
        durationSec: 15,
        label: 'Side plank, left side',
      });
      expect(steps[1]?.sub).toBe('Right side, 15 seconds');
    });

    it('keeps a switch-halfway item as one step carrying a midpoint cue', () => {
      const block: Block = {
        kind: 'timed_circuit',
        items: [{ exerciseSlug: 'row', durationSec: 45, side: 'switch-halfway' }],
      };
      const { steps } = compileWorkout(workoutOf([block]), catalogue);

      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({
        sub: '45 seconds, switch sides halfway',
        halfwayCue: 'Switch sides',
      });
    });

    it('describes a plain item by its duration alone', () => {
      const block: Block = {
        kind: 'timed_circuit',
        items: [{ exerciseSlug: 'goblet', durationSec: 45 }],
      };
      const { steps } = compileWorkout(workoutOf([block]), catalogue);

      expect(steps[0]?.sub).toBe('45 seconds');
      expect(steps[0]?.halfwayCue).toBeUndefined();
    });
  });

  describe('hold blocks', () => {
    it('labels the expanded items as stretches', () => {
      const block: Block = {
        kind: 'hold',
        items: [
          { exerciseSlug: 'child', durationSec: 45 },
          { exerciseSlug: 'hipflex', durationSec: 30, side: 'each-side' },
        ],
      };
      const { steps } = compileWorkout(workoutOf([block], 'cooldown'), catalogue);

      expect(steps.map((s) => s.round)).toEqual([
        'Stretch 1 of 3',
        'Stretch 2 of 3',
        'Stretch 3 of 3',
      ]);
    });
  });

  describe('emom blocks', () => {
    const block: Block = {
      kind: 'emom',
      rounds: 4,
      intervalSec: 120,
      tasks: ['20 kettlebell swings', '10 reverse lunges'],
      items: [{ exerciseSlug: 'swing' }, { exerciseSlug: 'squat' }],
    };

    it('emits one step per round, each filling the interval', () => {
      const { steps } = compileWorkout(workoutOf([block], 'endurance'), catalogue);

      expect(steps).toHaveLength(4);
      expect(steps[0]).toMatchObject({
        type: 'emom',
        title: 'Round 1 of 4',
        durationSec: 120,
        tasks: ['20 kettlebell swings', '10 reverse lunges'],
      });
      expect(steps[3]?.title).toBe('Round 4 of 4');
    });

    it('describes the interval in the round label', () => {
      const { steps } = compileWorkout(workoutOf([block], 'endurance'), catalogue);

      expect(steps[0]?.round).toBe('A new round every 2 minutes');
    });

    it('shows every exercise in the block as a detail', () => {
      const { steps } = compileWorkout(workoutOf([block], 'endurance'), catalogue);

      expect(steps[0]?.details.map((d) => d.name)).toEqual([
        'Kettlebell swing',
        'Bodyweight squat',
      ]);
    });
  });

  describe('prep steps', () => {
    it('precedes the block with a prep step carrying its hint', () => {
      const block: Block = {
        kind: 'timed_circuit',
        prep: { durationSec: 10, hint: 'Pick up your heavier bell.' },
        items: [{ exerciseSlug: 'goblet', durationSec: 45 }],
      };
      const { steps } = compileWorkout(workoutOf([block]), catalogue);

      expect(steps[0]).toMatchObject({
        type: 'prep',
        title: 'Get ready',
        durationSec: 10,
        hint: 'Pick up your heavier bell.',
      });
      expect(steps[1]?.type).toBe('work');
    });
  });

  describe('look-ahead', () => {
    const def = workoutOf([
      {
        kind: 'timed_circuit',
        workSec: 45,
        restSec: 15,
        items: [{ exerciseSlug: 'goblet' }, { exerciseSlug: 'row' }],
      },
    ]);

    it('tells a working step what follows it', () => {
      const { steps } = compileWorkout(def, catalogue);

      expect(steps[0]?.nextText).toBe('Next: Bent-over row');
    });

    it('tells the final working step that it is the last', () => {
      const { steps } = compileWorkout(def, catalogue);

      expect(steps.at(-1)?.nextText).toBe('Last one');
    });

    it('points a rest at the next working step, not the next step', () => {
      const { steps } = compileWorkout(def, catalogue);

      expect(steps[1]).toMatchObject({
        type: 'rest',
        sub: 'Next: Bent-over row',
        speech: 'Rest. Next, Bent-over row',
      });
      expect(steps[1]?.details.map((d) => d.name)).toEqual(['Bent-over row']);
    });

    it('announces a prep with its own wording', () => {
      const withPrep = workoutOf([
        {
          kind: 'timed_circuit',
          prep: { durationSec: 10, hint: 'Pick up your heavier bell.' },
          items: [{ exerciseSlug: 'goblet', durationSec: 45 }],
        },
      ]);
      const { steps } = compileWorkout(withPrep, catalogue);

      expect(steps[0]?.speech).toBe('Get ready. Next, Goblet squat');
    });
  });

  describe('timings', () => {
    const def: WorkoutDefinition = {
      id: 'w1',
      name: 'Two sections',
      description: '',
      sections: [
        {
          id: 'a',
          title: 'A',
          phase: 'warmup',
          intro: '',
          blocks: [
            {
              kind: 'reps',
              estimatedSecPerItem: 60,
              items: [{ exerciseSlug: 'squat', reps: '10 reps' }],
            },
          ],
        },
        {
          id: 'b',
          title: 'B',
          phase: 'strength',
          intro: '',
          blocks: [
            {
              kind: 'timed_circuit',
              workSec: 45,
              restSec: 15,
              items: [{ exerciseSlug: 'goblet' }, { exerciseSlug: 'row' }],
            },
          ],
        },
      ],
    };

    it('records the seconds elapsed before each step', () => {
      const { cumulativeSec } = compileWorkout(def, catalogue);

      expect(cumulativeSec).toEqual([0, 60, 105, 120]);
    });

    it('totals estimated and timed work alike', () => {
      const { totalSec } = compileWorkout(def, catalogue);

      expect(totalSec).toBe(165);
    });

    it('groups consecutive steps of the same phase into segments', () => {
      const { segments } = compileWorkout(def, catalogue);

      expect(segments).toEqual([
        { phase: 'warmup', startSec: 0, totalSec: 60 },
        { phase: 'strength', startSec: 60, totalSec: 105 },
      ]);
    });

    it('tags each step with the section it came from', () => {
      const { steps } = compileWorkout(def, catalogue);

      expect(steps.map((s) => s.sectionIndex)).toEqual([0, 1, 1, 1]);
    });
  });

  describe('starting part way through', () => {
    const def: WorkoutDefinition = {
      id: 'w1',
      name: 'Two sections',
      description: '',
      sections: [
        {
          id: 'a',
          title: 'A',
          phase: 'warmup',
          intro: '',
          blocks: [{ kind: 'reps', estimatedSecPerItem: 60, items: [{ exerciseSlug: 'squat' }] }],
        },
        {
          id: 'b',
          title: 'B',
          phase: 'strength',
          intro: '',
          blocks: [{ kind: 'timed_circuit', workSec: 45, items: [{ exerciseSlug: 'goblet' }] }],
        },
      ],
    };

    it('drops earlier sections and re-bases the timings', () => {
      const { steps, cumulativeSec, totalSec, segments } = compileWorkout(def, catalogue, {
        fromSectionIndex: 1,
      });

      expect(steps.map((s) => s.title)).toEqual(['Goblet squat']);
      expect(cumulativeSec).toEqual([0]);
      expect(totalSec).toBe(45);
      expect(segments).toEqual([{ phase: 'strength', startSec: 0, totalSec: 45 }]);
    });
  });

  describe('unknown exercises', () => {
    it('refuses to compile a workout referencing a missing exercise', () => {
      const block: Block = { kind: 'timed_circuit', items: [{ exerciseSlug: 'nope' }] };

      expect(() => compileWorkout(workoutOf([block]), catalogue)).toThrow(/nope/);
    });
  });
});
