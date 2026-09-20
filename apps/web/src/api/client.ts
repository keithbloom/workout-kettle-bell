import type { Exercise, WorkoutDefinition } from '@kb/core';

/**
 * The API client.
 *
 * Same-origin by design: Vite proxies /api to the Worker in development, and in
 * production the app and the API sit behind one hostname. That keeps the
 * session cookie a plain first-party cookie, which is both simpler and more
 * robust than cross-site cookies, several of which browsers now block.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new ApiError(res.status, detail || res.statusText);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface WorkoutSummary {
  id: string;
  name: string;
  description: string;
  isTemplate: boolean;
  ownerUserId: string | null;
}

export interface SessionRecord {
  id: string;
  clientId: string;
  workoutId: string | null;
  workoutName: string;
  startedAt: string;
  completedAt: string;
  activeSeconds: number;
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
}

export const api = {
  me: () => request<{ user: CurrentUser }>('/api/me'),

  exercises: () => request<{ exercises: Exercise[] }>('/api/exercises'),

  workouts: () => request<{ workouts: WorkoutSummary[] }>('/api/workouts'),

  workout: (id: string) => request<{ workout: WorkoutDefinition }>(`/api/workouts/${id}`),

  sessions: () => request<{ sessions: SessionRecord[]; thisWeek: number }>('/api/sessions'),

  recordSession: (body: {
    clientId: string;
    workoutId: string | null;
    workoutName: string;
    startedAt: number;
    completedAt: number;
    activeSeconds: number;
  }) =>
    request<{ session: SessionRecord }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  signInWithPassword: (email: string, password: string) =>
    request<unknown>('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  signUpWithPassword: (email: string, password: string, name: string) =>
    request<unknown>('/api/auth/sign-up/email', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  signOut: () => request<unknown>('/api/auth/sign-out', { method: 'POST', body: '{}' }),
};

/** Where to send the browser to sign in with Google. */
export function googleSignInUrl(): string {
  return '/api/auth/sign-in/social?provider=google';
}
