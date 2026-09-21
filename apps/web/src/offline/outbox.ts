import { del, get, set } from 'idb-keyval';

/**
 * Finished sessions waiting to reach the server.
 *
 * The contract is that a completed workout is never lost. A session is written
 * here *before* any attempt to send it, not queued after a failure: the tab can
 * be closed, the phone can die, the request can hang — the record is already on
 * disk either way.
 *
 * Sending is safe to repeat. The API upserts on (user, clientId), so a session
 * that was received but whose response never arrived is re-sent harmlessly
 * rather than duplicated.
 */

export interface PendingSession {
  /** Minted on the device before the run. The key for both the queue and the upsert. */
  clientId: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: number;
  completedAt: number;
  activeSeconds: number;
}

export type SendSession = (session: PendingSession) => Promise<unknown>;

export interface FlushResult {
  sent: number;
  failed: number;
  /** Rejected by the server in a way retrying cannot fix. */
  discarded?: number;
  /** A flush was already running, so this call did nothing. */
  skipped?: boolean;
}

const KEY = 'kb.outbox';

/** One flush at a time, or two triggers could send the same session twice. */
let flushing = false;

async function read(): Promise<PendingSession[]> {
  try {
    return (await get<PendingSession[]>(KEY)) ?? [];
  } catch {
    // Blocked or unavailable storage. Nothing queued is better than a crash.
    return [];
  }
}

async function write(sessions: PendingSession[]): Promise<void> {
  try {
    await set(KEY, sessions);
  } catch {
    // Nothing we can do; the session stays in memory for this flush only.
  }
}

/** Oldest first, so history fills in the order it happened. */
function byOldest(sessions: PendingSession[]): PendingSession[] {
  return [...sessions].sort((a, b) => a.completedAt - b.completedAt);
}

export async function pending(): Promise<PendingSession[]> {
  return byOldest(await read());
}

export async function enqueue(session: PendingSession): Promise<void> {
  const queued = await read();
  if (queued.some((s) => s.clientId === session.clientId)) return;

  await write([...queued, session]);
}

export async function clearOutbox(): Promise<void> {
  try {
    await del(KEY);
  } catch {
    // Already gone.
  }
}

/**
 * Whether a failure means "try later" or "this will never work".
 *
 * A 4xx is the server saying the payload is wrong; sending it again produces
 * the same answer, and a session that can never be accepted would otherwise
 * block everything queued behind it forever. Anything else — offline, a 5xx, a
 * timeout — is worth retrying.
 */
function isPermanent(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * Try to send everything queued.
 *
 * Stops at the first retryable failure: if one request failed because the
 * connection is gone, the rest will too, and there is no point spending the
 * battery to find out.
 */
export async function flush(send: SendSession): Promise<FlushResult> {
  // Claimed before the first await. Reading the queue first would let two
  // callers both pass this check and both send the same session.
  if (flushing) return { sent: 0, failed: 0, skipped: true };
  flushing = true;

  let sent = 0;
  let discarded = 0;

  try {
    const queued = await pending();
    if (queued.length === 0) return { sent: 0, failed: 0 };

    for (const session of queued) {
      try {
        await send(session);
        sent += 1;
      } catch (error) {
        if (!isPermanent(error)) {
          // Leave this one and everything after it for the next attempt.
          const remaining = queued.slice(sent + discarded);
          await write(remaining);
          return { sent, failed: remaining.length, ...(discarded ? { discarded } : {}) };
        }
        discarded += 1;
      }
    }

    await write([]);
    return { sent, failed: 0, ...(discarded ? { discarded } : {}) };
  } finally {
    flushing = false;
  }
}
