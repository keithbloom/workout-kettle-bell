import { del } from 'idb-keyval';

/** Where the persisted query cache lives; see main.tsx. */
export const QUERY_CACHE_KEY = 'kb.query-cache';

/**
 * Throw away the persisted cache.
 *
 * Signing out has to do this, not just clear the in-memory cache: the copy in
 * IndexedDB is what lets the app open offline as a signed-in user, so leaving
 * it behind would put the previous user's identity and workouts back on screen
 * at the next load.
 */
export async function clearPersistedCache(): Promise<void> {
  try {
    await del(QUERY_CACHE_KEY);
  } catch {
    // Storage unavailable; the reload below still drops the in-memory copy.
  }
}

/**
 * What is worth keeping in IndexedDB for an offline start.
 *
 * `me` is included so a signed-in phone opens without a network — but only
 * when there is actually a user. Persisting a null user is what broke sign-in:
 * signing out wrote "nobody" to disk, and because the query was considered
 * fresh for minutes, the next load restored that null, never asked the server,
 * and showed the sign-in screen to somebody holding a valid session.
 *
 * History is left out: cheap to refetch, and a stale count is worse than none.
 */
export function shouldPersist(queryKey: readonly unknown[], data: unknown): boolean {
  const root = queryKey[0];

  if (root === 'me') return data != null;
  return root === 'workouts' || root === 'workout' || root === 'exercises';
}
