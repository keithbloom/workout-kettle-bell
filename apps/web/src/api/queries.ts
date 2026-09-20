import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

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
    queryFn: async () => (await api.workout(id!)).workout,
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

export function useRecordSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: api.recordSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
