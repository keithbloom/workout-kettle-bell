import { describe, expect, it } from 'vitest';
import { shouldPersist } from './cache';

/**
 * What survives a reload decides what the app believes before it has spoken to
 * the server, so these are load-bearing.
 */
describe('what gets persisted for offline use', () => {
  it('keeps the signed-in user, so the app opens without a network', () => {
    expect(shouldPersist(['me'], { id: 'u1', email: 'a@b.c', name: 'A' })).toBe(true);
  });

  /*
   * The regression that broke sign-in: signing out wrote "nobody" to disk, and
   * the next load restored it, trusted it, and showed the sign-in screen to
   * somebody who had just authenticated successfully.
   */
  it('never remembers being signed out', () => {
    expect(shouldPersist(['me'], null)).toBe(false);
    expect(shouldPersist(['me'], undefined)).toBe(false);
  });

  it('keeps what a session needs to start', () => {
    expect(shouldPersist(['workouts'], [])).toBe(true);
    expect(shouldPersist(['workout', 'kettlebell-and-mat'], {})).toBe(true);
    expect(shouldPersist(['exercises'], [])).toBe(true);
  });

  it('does not keep history or the outbox count, which are cheap to recompute', () => {
    expect(shouldPersist(['sessions'], {})).toBe(false);
    expect(shouldPersist(['outbox'], 0)).toBe(false);
  });
});
