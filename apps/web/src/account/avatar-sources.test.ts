import { describe, expect, it } from 'vitest';
import { gravatarUrl, initials } from './avatar-sources';

describe('initials', () => {
  it('takes the first letter of the first and last name', () => {
    expect(initials('Keith Bloom', 'k@example.com')).toBe('KB');
  });

  it('copes with a single name', () => {
    expect(initials('Keith', 'k@example.com')).toBe('K');
  });

  it('ignores middle names', () => {
    expect(initials('Keith John Bloom', 'k@example.com')).toBe('KB');
  });

  it('falls back to the email when there is no name', () => {
    expect(initials('', 'keith@example.com')).toBe('K');
  });

  it('never returns nothing', () => {
    expect(initials('', '')).toBe('?');
  });

  it('is upper case even when the name is not', () => {
    expect(initials('keith bloom', 'k@example.com')).toBe('KB');
  });
});

describe('gravatar', () => {
  /*
   * Gravatar accepts a SHA-256 of the address, which the browser can compute
   * natively. The older MD5 form would mean shipping a hash implementation for
   * a fallback most people never see.
   */
  it('hashes the address', async () => {
    const url = await gravatarUrl('keith@example.com');

    expect(url).toMatch(/^https:\/\/gravatar\.com\/avatar\/[0-9a-f]{64}/);
  });

  it('normalises case and surrounding space, as gravatar requires', async () => {
    const a = await gravatarUrl('  Keith@Example.COM  ');
    const b = await gravatarUrl('keith@example.com');

    expect(a).toBe(b);
  });

  it('asks for nothing rather than a generated image, so we can fall back', async () => {
    const url = await gravatarUrl('keith@example.com');

    expect(url).toContain('d=404');
  });

  it('has nothing to offer without an address', async () => {
    await expect(gravatarUrl('')).resolves.toBeNull();
  });
});
