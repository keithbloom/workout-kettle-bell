import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { flush, pending } from './outbox';

/** How many finished sessions are still on the device only. */
export const OUTBOX_KEY = ['outbox'] as const;

/**
 * Keeps the outbox draining.
 *
 * Flushes when the app opens, whenever the browser says it is back online, and
 * whenever the tab returns to the foreground — a phone that has been in a
 * pocket for a whole session often never fires an `online` event, because as
 * far as it is concerned it never went offline; it was asleep.
 *
 * The count is a query rather than local state so that recording a session can
 * invalidate it and the banner updates, without the player having to know a
 * banner exists.
 */
export function useSync() {
  const queryClient = useQueryClient();

  const { data: waiting = 0 } = useQuery({
    queryKey: OUTBOX_KEY,
    queryFn: async () => (await pending()).length,
    staleTime: Infinity,
  });

  const sync = useCallback(async () => {
    const result = await flush((session) => api.recordSession(session));
    if (result.sent > 0) {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    }
    void queryClient.invalidateQueries({ queryKey: OUTBOX_KEY });
  }, [queryClient]);

  useEffect(() => {
    void sync();

    const onOnline = () => void sync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  return { waiting, sync };
}
