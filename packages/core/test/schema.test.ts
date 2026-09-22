import { describe, expect, it } from 'vitest';
import { workoutDefinitionSchema, workoutDraftSchema, LIMITS } from '../src/schema';
import { KETTLEBELL_AND_MAT } from '../src/seed/kettlebell-and-mat';

/**
 * The loose shapes the tests build by hand: every field optional and writable,
 * so a test can set one to something illegal without the compiler objecting
 * before the schema gets a chance to.
 */
interface LooseBlock {
  kind?: string;
  items?: { exerciseSlug?: string }[];
  rounds?: number;
  workSec?: number;
  restSec?: number;
  intervalSec?: number;
}

interface LooseSection {
  id?: string;
  title?: string;
  phase?: string;
  intro?: string;
  blocks: LooseBlock[];
}

interface LooseDraft {
  name: string;
  description: string;
  sections: LooseSection[];
}

/** A minimal legal workout, for tests that bend one field at a time. */
function draft(overrides: Record<string, unknown> = {}): LooseDraft {
  return {
    name: 'My workout',
    description: '',
    sections: [
      {
        id: 'main',
        title: 'Main',
        phase: 'strength',
        intro: '',
        blocks: [
          {
            kind: 'timed_circuit',
            workSec: 45,
            restSec: 15,
            items: [{ exerciseSlug: 'goblet' }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('the workout contract', () => {
  it('accepts the built-in workout', () => {
    expect(workoutDefinitionSchema.safeParse(KETTLEBELL_AND_MAT).success).toBe(true);
  });

  /*
   * Unknown keys are stripped on parse, so anything the schema forgot to
   * describe disappears here. That makes this the drift check: add a field to
   * the domain without adding it to the contract and the round-trip stops
   * matching.
   */
  it('preserves every field of the built-in workout', () => {
    const parsed = workoutDefinitionSchema.parse(KETTLEBELL_AND_MAT);

    expect(parsed).toEqual(KETTLEBELL_AND_MAT);
  });

  it('accepts a minimal draft', () => {
    expect(workoutDraftSchema.safeParse(draft()).success).toBe(true);
  });

  it('rejects a draft that supplies its own id', () => {
    const result = workoutDraftSchema.safeParse({ ...draft(), id: 'mine' });

    // The id is ours to mint, so an extra one is ignored rather than honoured.
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('id');
  });

  it.each([
    ['no name', { name: '' }],
    ['no sections', { sections: [] }],
    [
      'too many sections',
      { sections: Array(LIMITS.sectionsPerWorkout + 1).fill(draft().sections[0]) },
    ],
  ])('rejects a workout with %s', (_label, override) => {
    expect(workoutDraftSchema.safeParse(draft(override)).success).toBe(false);
  });

  it('rejects an unknown phase', () => {
    const bad = draft();
    bad.sections[0]!.phase = 'cardio';

    expect(workoutDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown block kind', () => {
    const bad = draft();
    bad.sections[0]!.blocks[0]!.kind = 'amrap';

    expect(workoutDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a block with no exercises', () => {
    const bad = draft();
    bad.sections[0]!.blocks[0]!.items = [];

    expect(workoutDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a step longer than an hour', () => {
    const bad = draft();
    bad.sections[0]!.blocks[0]!.workSec = LIMITS.durationSec + 1;

    expect(workoutDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an absurd number of rounds', () => {
    const bad = draft();
    bad.sections[0]!.blocks[0]!.rounds = LIMITS.rounds + 1;

    expect(workoutDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a negative rest', () => {
    const bad = draft();
    bad.sections[0]!.blocks[0]!.restSec = -1;

    expect(workoutDraftSchema.safeParse(bad).success).toBe(false);
  });

  it('allows a rest of zero, meaning straight through', () => {
    const ok = draft();
    ok.sections[0]!.blocks[0]!.restSec = 0;

    expect(workoutDraftSchema.safeParse(ok).success).toBe(true);
  });
});
