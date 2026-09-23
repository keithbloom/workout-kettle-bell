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
