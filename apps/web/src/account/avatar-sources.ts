/**
 * Working out what to show for somebody's face.
 *
 * Three fallbacks, in order: the picture the identity provider gave us,
 * Gravatar, then their initials. Only the first needs no network and no third
 * party, which is why it comes first.
 */

/**
 * Gravatar's URL for an address, or null if there is no address.
 *
 * Uses the SHA-256 form, which the browser can hash natively — the older MD5
 * form would mean shipping a hash implementation for a fallback most people
 * never see. `d=404` asks Gravatar to fail rather than invent an image, so the
 * caller can fall through to initials.
 *
 * Note this does send a hash of the address to a third party, and only happens
 * when the provider gave us no picture.
 */
export async function gravatarUrl(email: string): Promise<string | null> {
  const address = email.trim().toLowerCase();
  if (!address) return null;

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(address));
  const hash = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

  return `https://gravatar.com/avatar/${hash}?d=404&s=160`;
}

/** One or two letters to stand in for a face. Never empty. */
export function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0]![0]!.toUpperCase();
  }

  const fromEmail = email.trim()[0];
  return fromEmail ? fromEmail.toUpperCase() : '?';
}
