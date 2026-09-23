import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client';
import { clearPersistedCache } from '../api/cache';
import { flush, pending } from '../offline/outbox';

/**
 * Who is signed in, if anyone.
 *
 * A 401 is an answer, not a failure: it means "nobody", so it resolves to null
 * rather than throwing and is never retried. Anything else is a real error and
 * is left to surface.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const { user } = await api.me();
        return user;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
    /*
     * Always ask the server who you are, even when a cached answer exists.
     * The cache is here for the offline case: if the request fails, the
     * restored user stays and the app still opens. But trusting a cached
     * answer without asking meant arriving back from Google with a valid
     * session and being shown the sign-in screen anyway.
     */
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.signInWithPassword(email, password),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useSignUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, password, name }: { email: string; password: string; name: string }) =>
      api.signUpWithPassword(email, password, name),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

/**
 * Sign out, then reload.
 *
 * `queryClient.clear()` alone is not enough — it empties the in-memory cache
 * without telling the mounted components to reconsider, so the screen stays as
 * it was and you appear still signed in. A full reload is the honest way to
 * get back to a blank slate, and signing out is rare enough to afford one.
 */
export function useSignOut() {
  return useMutation({
    mutationFn: async () => {
      // Last chance to hand over anything finished offline: once the session is
      // gone these would sync to whoever signs in next.
      if ((await pending()).length > 0) {
        await flush((session) => api.recordSession(session)).catch(() => undefined);
      }

      await api.signOut();
      await clearPersistedCache();
    },
    onSuccess: () => {
      window.location.href = '/';
    },
  });
}
