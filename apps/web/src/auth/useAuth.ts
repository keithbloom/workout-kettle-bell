import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../api/client.js';

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
    staleTime: 5 * 60 * 1000,
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

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.signOut(),
    onSuccess: () => queryClient.clear(),
  });
}
