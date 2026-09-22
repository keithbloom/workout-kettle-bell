import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileInterval, compileWorkout } from '@kb/core';
import type { Exercise } from '@kb/core';
import { Player } from './Player';

/**
 * The player's behaviour as a user meets it, not its markup.
 *
 * Time is faked so a forty-second step does not take forty seconds; everything
 * else is real, including the engine underneath.
 */

const catalogue: Exercise[] = [
  { slug: 'goblet', name: 'Goblet squat', description: 'Chest tall.', defaultDose: '45 sec' },
  {
    slug: 'swing',
    name: 'Kettlebell swing',
    description: 'Hips, not arms.',
    defaultDose: '20 reps',
  },
  { slug: 'squat', name: 'Bodyweight squat', description: 'Sit back.', defaultDose: '10 reps' },
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The big heading. Queried by its own element because an exercise name also
 * appears in the instructions panel, so a plain text query matches twice.
 */
function stepTitle(): string {
  return document.querySelector('.p-title')!.textContent ?? '';
}

/** Let the 100ms tick run for `seconds` of fake time. */
async function passSeconds(seconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
  });
}

function timedRun() {
  return compileWorkout(
    {
      id: 'w',
      name: 'W',
      description: '',
      sections: [
        {
          id: 's',
          title: 'Strength',
          phase: 'strength',
          intro: '',
          blocks: [
            {
              kind: 'timed_circuit',
              workSec: 10,
              restSec: 5,
              items: [{ exerciseSlug: 'goblet' }, { exerciseSlug: 'swing' }],
            },
          ],
        },
      ],
    },
    catalogue,
  );
}

function renderPlayer(run = timedRun(), overrides: Partial<Parameters<typeof Player>[0]> = {}) {
  const onFinished = vi.fn();
  const onClose = vi.fn();
  render(<Player run={run} onFinished={onFinished} onClose={onClose} {...overrides} />);
  return { onFinished, onClose };
}

describe('the player', () => {
  it('opens on the first exercise', () => {
    renderPlayer();

    expect(stepTitle()).toBe('Goblet squat');
    expect(screen.getByRole('timer')).toHaveTextContent('10');
  });

  it('names the phase and the round', () => {
    renderPlayer();

    expect(screen.getByText('Strength')).toBeInTheDocument();
    expect(screen.getByText('Move 1 of 2')).toBeInTheDocument();
  });

  it('counts down', async () => {
    renderPlayer();

    await passSeconds(4);

    expect(screen.getByRole('timer')).toHaveTextContent('6');
  });

  it('moves to the rest when the time runs out', async () => {
    renderPlayer();

    await passSeconds(11);

    expect(screen.getByText('Rest')).toBeInTheDocument();
    expect(screen.getByText('Next: Kettlebell swing')).toBeInTheDocument();
  });

  it('says what is coming next while you work', () => {
    renderPlayer();

    expect(screen.getByText('Next: Kettlebell swing')).toBeInTheDocument();
  });

  it('stops the clock when paused', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPlayer();

    await passSeconds(3);
    await user.click(screen.getByRole('button', { name: /pause/i }));
    await passSeconds(5);

    expect(screen.getByRole('timer')).toHaveTextContent('7');
  });

  it('carries on when resumed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPlayer();

    await passSeconds(3);
    await user.click(screen.getByRole('button', { name: /pause/i }));
    await passSeconds(5);
    await user.click(screen.getByRole('button', { name: /resume/i }));
    // 2.5s rather than 2s: at exactly 5s left the clock is on a rounding
    // boundary, where a millisecond of click overhead flips it to 6.
    await passSeconds(2.5);

    expect(screen.getByRole('timer')).toHaveTextContent('5');
  });

  it('skips ahead', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(screen.getByText('Rest')).toBeInTheDocument();
  });

  it('shows how to do the exercise on request', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'How to do it' }));

    expect(screen.getByText('Chest tall.')).toBeInTheDocument();
  });

  it('asks before abandoning a session', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onClose } = renderPlayer();

    await user.click(screen.getByRole('button', { name: 'End session' }));
    expect(screen.getByText('End this session?')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Keep going' }));
    expect(screen.queryByText('End this session?')).not.toBeInTheDocument();
  });
});

describe('an untimed step', () => {
  const run = compileWorkout(
    {
      id: 'w',
      name: 'W',
      description: '',
      sections: [
        {
          id: 'a',
          title: 'Warm-up',
          phase: 'warmup',
          intro: '',
          blocks: [
            {
              kind: 'reps',
              estimatedSecPerItem: 30,
              items: [{ exerciseSlug: 'squat', reps: '10 reps' }, { exerciseSlug: 'goblet' }],
            },
          ],
        },
      ],
    },
    catalogue,
  );

  it('shows no clock', () => {
    renderPlayer(run);

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('waits for you rather than moving on', async () => {
    renderPlayer(run);

    await passSeconds(120);

    expect(stepTitle()).toBe('Bodyweight squat');
  });

  it('advances when you say you are done', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPlayer(run);

    await user.click(screen.getByRole('button', { name: 'Done' }));

    expect(stepTitle()).toBe('Goblet squat');
  });

  it('opens the instructions by default, since there is no clock to watch', () => {
    renderPlayer(run);

    expect(screen.getByText('Sit back.')).toBeInTheDocument();
  });
});

describe('an emom round', () => {
  const run = compileWorkout(
    {
      id: 'w',
      name: 'W',
      description: '',
      sections: [
        {
          id: 'e',
          title: 'Endurance',
          phase: 'endurance',
          intro: '',
          blocks: [
            {
              kind: 'emom',
              rounds: 2,
              intervalSec: 60,
              tasks: ['20 kettlebell swings', '5 push-ups'],
              items: [{ exerciseSlug: 'swing' }],
            },
          ],
        },
      ],
    },
    catalogue,
  );

  it('lists the work as a checklist', () => {
    renderPlayer(run);

    expect(screen.getByRole('button', { name: /20 kettlebell swings/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5 push-ups/ })).toBeInTheDocument();
  });

  it('marks a line done when tapped', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPlayer(run);

    const line = screen.getByRole('button', { name: /20 kettlebell swings/ });
    await user.click(line);

    expect(line).toHaveAttribute('aria-pressed', 'true');
  });

  it('becomes a rest once every line is ticked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPlayer(run);

    await user.click(screen.getByRole('button', { name: /20 kettlebell swings/ }));
    await user.click(screen.getByRole('button', { name: /5 push-ups/ }));

    expect(screen.getByText('Rest')).toBeInTheDocument();
    // The clock keeps running: the round still ends when the interval does.
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });
});

describe('finishing', () => {
  it('reports the session and shows the finish screen', async () => {
    const run = compileInterval({ workSec: 5, restSec: 0, rounds: 1, prepSec: 0 });
    const { onFinished } = renderPlayer(run, { finishTitle: 'Timer finished' });

    await passSeconds(6);

    expect(onFinished).toHaveBeenCalledWith({ activeSeconds: expect.any(Number) });
    expect(screen.getByText('Timer finished')).toBeInTheDocument();
  });

  it('returns to the app when dismissed', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const run = compileInterval({ workSec: 5, restSec: 0, rounds: 1, prepSec: 0 });
    const { onClose } = renderPlayer(run);

    await passSeconds(6);
    await user.click(screen.getByRole('button', { name: 'Back to the app' }));

    expect(onClose).toHaveBeenCalled();
  });
});
