import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkoutDraft } from '@kb/core';
import { api } from './client.js';
import { enqueue, flush, type PendingSession } from '../offline/outbox.js';
import { OUTBOX_KEY } from '../offline/useSync.js';

/**
 * Workouts and the catalogue change rarely and are needed to start a session,
 * so they are held for a long time. Phase 5 will persist this cache to
 * IndexedDB, which is what makes an offline start possible.
 */
const LONG_LIVED = { staleTime: 30 * 60 * 1000, gcTime: 24 * 60 * 60 * 1000 };

export function useWorkouts() {
  return useQuery({
    queryKey: ['workouts'],
    queryFn: async () => (await api.workouts()).workouts,
    ...LONG_LIVED,
  });
}

export function useWorkout(id: string | undefined) {
  return useQuery({
    queryKey: ['workout', id],
    queryFn: () => api.workout(id!),
    enabled: !!id,
    ...LONG_LIVED,
  });
}

export function useExercises() {
  return useQuery({
    queryKey: ['exercises'],
    queryFn: async () => (await api.exercises()).exercises,
    ...LONG_LIVED,
  });
}

export function useHistory() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.sessions(),
  });
}

export function useSaveWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, draft }: { id?: string; draft: WorkoutDraft }) =>
      id ? api.updateWorkout(id, draft) : api.createWorkout(draft),
    // The individual workout has to be invalidated as well as the list.
    // Workouts are cached for half an hour, so without this an edit saves and
    // then the detail screen shows the version it had before.
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['workouts'] });
      void queryClient.invalidateQueries({ queryKey: ['workout', result.id] });
    },
  });
}

export function useDeleteWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.deleteWorkout,
    onSuccess: (_result, id) => {
      void queryClient.invalidateQueries({ queryKey: ['workouts'] });
      queryClient.removeQueries({ queryKey: ['workout', id] });
    },
  });
}

export function useCopyWorkout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.copyWorkout,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workouts'] }),
  });
}

/**
 * Record a finished session.
 *
 * Writes to the outbox before trying to send. A workout finished in a basement
 * with no signal is already safely on disk by the time the request is even
 * attempted, and the same record is what gets retried later.
 */
export function useRecordSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (session: PendingSession) => {
      await enqueue(session);
      return flush((s) => api.recordSession(s));
    },
    // Settled, not success: a session that could not be sent still changed
    // what is on the device, and the banner needs to say so.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void queryClient.invalidateQueries({ queryKey: OUTBOX_KEY });
    },
  });
}
