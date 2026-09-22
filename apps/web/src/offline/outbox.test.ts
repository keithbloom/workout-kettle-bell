import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOutbox, enqueue, flush, pending, type PendingSession } from './outbox';

/**
 * The outbox is the thing standing between a finished workout and losing it.
 * These tests are about what survives: a dropped connection, a closed tab, a
 * flush that runs twice, a server that rejects the payload outright.
 */

function session(overrides: Partial<PendingSession> = {}): PendingSession {
  return {
    clientId: crypto.randomUUID(),
    workoutId: 'kettlebell-and-mat',
    workoutName: 'Kettlebell and mat',
    startedAt: 1_000_000,
    completedAt: 1_001_820,
    activeSeconds: 1820,
    ...overrides,
  };
}

beforeEach(async () => {
  await clearOutbox();
});

describe('queueing a session', () => {
  it('keeps it until it is sent', async () => {
    const one = session();
    await enqueue(one);

    await expect(pending()).resolves.toEqual([one]);
  });

  it('keeps several, oldest first', async () => {
    const first = session({ completedAt: 1 });
    const second = session({ completedAt: 2 });
    await enqueue(second);
    await enqueue(first);

    const queued = await pending();
    expect(queued.map((s) => s.completedAt)).toEqual([1, 2]);
  });

  it('does not queue the same session twice', async () => {
    const one = session();
    await enqueue(one);
    await enqueue(one);

    await expect(pending()).resolves.toHaveLength(1);
  });
});

describe('flushing', () => {
  it('sends each queued session and empties the queue', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await enqueue(session());
    await enqueue(session());

    const result = await flush(send);

    expect(send).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ sent: 2, failed: 0 });
    await expect(pending()).resolves.toEqual([]);
  });

  it('keeps anything it could not send', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    await enqueue(session());

    const result = await flush(send);

    expect(result).toEqual({ sent: 0, failed: 1 });
    await expect(pending()).resolves.toHaveLength(1);
  });

  it('stops at the first failure rather than hammering a dead connection', async () => {
    const send = vi.fn().mockRejectedValue(new Error('offline'));
    await enqueue(session());
    await enqueue(session());

    await flush(send);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('drops a session the server refuses, since retrying cannot help', async () => {
    const send = vi.fn().mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
    await enqueue(session());

    const result = await flush(send);

    expect(result).toEqual({ sent: 0, failed: 0, discarded: 1 });
    await expect(pending()).resolves.toEqual([]);
  });

  it('leaves the queue alone when there is nothing to send', async () => {
    const send = vi.fn();

    await expect(flush(send)).resolves.toEqual({ sent: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('will not run twice at once, so a session is not sent twice', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = vi.fn().mockReturnValue(blocked);
    await enqueue(session());

    const first = flush(send);
    const second = await flush(send);

    // The second call finds a flush already running and does nothing.
    expect(second).toEqual({ sent: 0, failed: 0, skipped: true });
    release();
    await first;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends the oldest session first', async () => {
    const order: number[] = [];
    const send = vi.fn().mockImplementation(async (s: PendingSession) => {
      order.push(s.completedAt);
    });
    await enqueue(session({ completedAt: 2 }));
    await enqueue(session({ completedAt: 1 }));

    await flush(send);

    expect(order).toEqual([1, 2]);
  });
});
