import { describe, expect, it } from 'vitest';
import { compileInterval } from '../src/compile-interval.js';
import type { IntervalConfig } from '../src/types.js';

const config: IntervalConfig = { workSec: 40, restSec: 20, rounds: 3, prepSec: 5 };

describe('compileInterval', () => {
  it('opens with a get-ready step', () => {
    const { steps } = compileInterval(config);

    expect(steps[0]).toMatchObject({
      type: 'prep',
      title: 'Get ready',
      sub: 'Round 1 starts soon',
      durationSec: 5,
    });
  });

  it('omits the get-ready step when no prep time is set', () => {
    const { steps } = compileInterval({ ...config, prepSec: 0 });

    expect(steps[0]?.type).toBe('work');
  });

  it('alternates work and rest, ending on work', () => {
    const { steps } = compileInterval({ ...config, prepSec: 0 });

    expect(steps.map((s) => s.type)).toEqual(['work', 'rest', 'work', 'rest', 'work']);
  });

  it('labels every step with its round', () => {
    const { steps } = compileInterval({ ...config, prepSec: 0 });

    expect(steps.map((s) => s.round)).toEqual([
      'Round 1 of 3',
      'Round 1 of 3',
      'Round 2 of 3',
      'Round 2 of 3',
      'Round 3 of 3',
    ]);
  });

  it('points each rest at the round that follows it', () => {
    const { steps } = compileInterval({ ...config, prepSec: 0 });

    expect(steps[1]).toMatchObject({ title: 'Rest', sub: 'Next: round 2', durationSec: 20 });
  });

  it('runs straight through when no rest is set', () => {
    const { steps } = compileInterval({ ...config, prepSec: 0, restSec: 0 });

    expect(steps.every((s) => s.type === 'work')).toBe(true);
    expect(steps).toHaveLength(3);
  });

  it('totals prep, work and rest', () => {
    const { totalSec } = compileInterval(config);

    expect(totalSec).toBe(5 + 3 * 40 + 2 * 20);
  });

  it('records the seconds elapsed before each step', () => {
    const { cumulativeSec } = compileInterval({ ...config, prepSec: 0 });

    expect(cumulativeSec).toEqual([0, 40, 60, 100, 120]);
  });

  it('treats the whole timer as a single progress segment', () => {
    const { segments } = compileInterval(config);

    expect(segments).toEqual([{ phase: 'interval', startSec: 0, totalSec: 165 }]);
  });
});
