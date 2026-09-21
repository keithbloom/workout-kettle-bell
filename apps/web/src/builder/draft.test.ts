import { describe, expect, it } from 'vitest';
import { compileWorkout, workoutDraftSchema } from '@kb/core';
import type { Exercise } from '@kb/core';
import {
  addBlock,
  addItem,
  addSection,
  createEmpty,
  fromDefinition,
  moveItem,
  moveSection,
  removeBlock,
  removeItem,
  removeSection,
  toWorkoutDraft,
  updateBlock,
  updateItem,
  updateSection,
} from './draft.js';

const catalogue: Exercise[] = [
  { slug: 'goblet', name: 'Goblet squat', description: 'Chest tall.', defaultDose: '45 sec' },
  { slug: 'row', name: 'Bent-over row', description: 'Flat back.', defaultDose: '45 sec' },
  { slug: 'swing', name: 'Kettlebell swing', description: 'Hips.', defaultDose: '20 reps' },
];

describe('a new workout', () => {
  it('starts with one section holding one block', () => {
    const draft = createEmpty();

    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]!.blocks).toHaveLength(1);
  });

  it('starts empty enough to need a name', () => {
    const draft = createEmpty();

    expect(workoutDraftSchema.safeParse(toWorkoutDraft(draft)).success).toBe(false);
  });

  it('is valid once it has a name and an exercise', () => {
    let draft = createEmpty();
    draft = { ...draft, name: 'Morning' };
    draft = addItem(draft, 0, 0, 'goblet');

    expect(workoutDraftSchema.safeParse(toWorkoutDraft(draft)).success).toBe(true);
  });
});

describe('starting from an existing workout', () => {
  it('keeps everything the compiler would use', () => {
    let draft = fromDefinition({
      id: 'w',
      name: 'Original',
      description: 'As written.',
      sections: [
        {
          id: 's',
          title: 'Strength',
          phase: 'strength',
          intro: 'Heavy bell.',
          blocks: [
            {
              kind: 'timed_circuit',
              rounds: 2,
              workSec: 45,
              restSec: 15,
              prep: { durationSec: 10, hint: 'Pick it up.' },
              items: [{ exerciseSlug: 'row', side: 'switch-halfway', switchNoun: 'arms' }],
            },
          ],
        },
      ],
    });
    draft = { ...draft, name: 'Copy' };

    const out = toWorkoutDraft(draft);

    expect(out.sections[0]!.blocks[0]).toMatchObject({
      rounds: 2,
      workSec: 45,
      restSec: 15,
      prep: { durationSec: 10, hint: 'Pick it up.' },
    });
    expect(out.sections[0]!.blocks[0]!.items[0]).toMatchObject({
      exerciseSlug: 'row',
      side: 'switch-halfway',
      switchNoun: 'arms',
    });
  });

  it('gives every block and item a key of its own', () => {
    const draft = fromDefinition({
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
              items: [{ exerciseSlug: 'goblet' }, { exerciseSlug: 'goblet' }],
            },
          ],
        },
      ],
    });

    const [first, second] = draft.sections[0]!.blocks[0]!.items;
    expect(first!.key).not.toBe(second!.key);
  });
});

describe('sections', () => {
  it('can be added', () => {
    const draft = addSection(createEmpty(), 'cooldown');

    expect(draft.sections).toHaveLength(2);
    expect(draft.sections[1]!.phase).toBe('cooldown');
  });

  it('are named after the phase they are given', () => {
    const draft = addSection(createEmpty(), 'cooldown');

    expect(draft.sections[1]!.title).toBe('Cool-down');
  });

  it('get ids that do not collide', () => {
    const draft = addSection(addSection(createEmpty(), 'core'), 'core');
    const ids = draft.sections.map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('can be renamed', () => {
    const draft = updateSection(createEmpty(), 0, { title: 'Openers' });

    expect(draft.sections[0]!.title).toBe('Openers');
  });

  it('can be removed', () => {
    let draft = addSection(createEmpty(), 'core');
    draft = removeSection(draft, 0);

    expect(draft.sections).toHaveLength(1);
    expect(draft.sections[0]!.phase).toBe('core');
  });

  it('keeps at least one, so there is always somewhere to add a move', () => {
    const draft = removeSection(createEmpty(), 0);

    expect(draft.sections).toHaveLength(1);
  });

  it('can be reordered', () => {
    let draft = addSection(createEmpty(), 'cooldown');
    draft = moveSection(draft, 1, -1);

    expect(draft.sections[0]!.phase).toBe('cooldown');
  });

  it('will not move off either end', () => {
    const draft = createEmpty();

    expect(moveSection(draft, 0, -1).sections).toEqual(draft.sections);
    expect(moveSection(draft, 0, 1).sections).toEqual(draft.sections);
  });
});

describe('blocks', () => {
  it('can be added with sensible defaults for their kind', () => {
    const draft = addBlock(createEmpty(), 0, 'emom');
    const block = draft.sections[0]!.blocks[1]!;

    expect(block.kind).toBe('emom');
    expect(block.rounds).toBeGreaterThan(0);
    expect(block.intervalSec).toBeGreaterThan(0);
  });

  it('can be retyped without losing their exercises', () => {
    let draft = addItem(createEmpty(), 0, 0, 'goblet');
    draft = updateBlock(draft, 0, 0, { kind: 'hold' });

    expect(draft.sections[0]!.blocks[0]!.kind).toBe('hold');
    expect(draft.sections[0]!.blocks[0]!.items).toHaveLength(1);
  });

  it('can be removed', () => {
    let draft = addBlock(createEmpty(), 0, 'reps');
    draft = removeBlock(draft, 0, 0);

    expect(draft.sections[0]!.blocks).toHaveLength(1);
    expect(draft.sections[0]!.blocks[0]!.kind).toBe('reps');
  });

  it('keeps at least one per section', () => {
    const draft = removeBlock(createEmpty(), 0, 0);

    expect(draft.sections[0]!.blocks).toHaveLength(1);
  });
});

describe('exercises in a block', () => {
  it('can be added', () => {
    const draft = addItem(createEmpty(), 0, 0, 'swing');

    expect(draft.sections[0]!.blocks[0]!.items[0]!.exerciseSlug).toBe('swing');
  });

  it('can be given a dose of their own', () => {
    let draft = addItem(createEmpty(), 0, 0, 'goblet');
    draft = updateItem(draft, 0, 0, 0, { durationSec: 30, side: 'each-side' });

    expect(draft.sections[0]!.blocks[0]!.items[0]).toMatchObject({
      durationSec: 30,
      side: 'each-side',
    });
  });

  it('drop a field when it is cleared rather than storing undefined', () => {
    let draft = addItem(createEmpty(), 0, 0, 'goblet');
    draft = updateItem(draft, 0, 0, 0, { durationSec: 30 });
    draft = updateItem(draft, 0, 0, 0, { durationSec: undefined });

    expect(toWorkoutDraft(draft).sections[0]!.blocks[0]!.items[0]).not.toHaveProperty(
      'durationSec',
    );
  });

  it('can be reordered', () => {
    let draft = addItem(createEmpty(), 0, 0, 'goblet');
    draft = addItem(draft, 0, 0, 'swing');
    draft = moveItem(draft, 0, 0, 1, -1);

    expect(draft.sections[0]!.blocks[0]!.items.map((i) => i.exerciseSlug)).toEqual([
      'swing',
      'goblet',
    ]);
  });

  it('can be removed', () => {
    let draft = addItem(createEmpty(), 0, 0, 'goblet');
    draft = addItem(draft, 0, 0, 'swing');
    draft = removeItem(draft, 0, 0, 0);

    expect(draft.sections[0]!.blocks[0]!.items.map((i) => i.exerciseSlug)).toEqual(['swing']);
  });
});

describe('what the builder sends', () => {
  it('carries no editor bookkeeping', () => {
    let draft = createEmpty();
    draft = { ...draft, name: 'Morning' };
    draft = addItem(draft, 0, 0, 'goblet');

    const json = JSON.stringify(toWorkoutDraft(draft));

    expect(json).not.toContain('"key"');
  });

  it('compiles, so the preview and the session agree', () => {
    let draft = createEmpty();
    draft = { ...draft, name: 'Morning' };
    draft = addItem(draft, 0, 0, 'goblet');
    draft = addItem(draft, 0, 0, 'swing');

    const run = compileWorkout({ id: 'preview', ...toWorkoutDraft(draft) }, catalogue);

    expect(run.steps.length).toBeGreaterThan(0);
    expect(run.totalSec).toBeGreaterThan(0);
  });
});
