import type { Exercise, WorkoutDefinition, WorkoutDraft } from '@kb/core';

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

  workout: (id: string) =>
    request<{ workout: WorkoutDefinition; canEdit: boolean }>(`/api/workouts/${id}`),

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

  createWorkout: (draft: WorkoutDraft) =>
    request<{ id: string }>('/api/workouts', { method: 'POST', body: JSON.stringify(draft) }),

  updateWorkout: (id: string, draft: WorkoutDraft) =>
    request<{ id: string }>(`/api/workouts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(draft),
    }),

  deleteWorkout: (id: string) => request<void>(`/api/workouts/${id}`, { method: 'DELETE' }),

  copyWorkout: (id: string) =>
    request<{ id: string }>(`/api/workouts/${id}/copy`, { method: 'POST', body: '{}' }),

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

/**
 * Begin the Google sign-in dance.
 *
 * Better Auth does not expose a link you can navigate to: you POST, it mints a
 * state and a PKCE challenge, and it hands back the consent URL to send the
 * browser to. A plain `<a href>` to the same path is a GET, which has no route
 * and returns 404.
 */
export async function startGoogleSignIn(): Promise<void> {
  const { url } = await request<{ url: string; redirect: boolean }>('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      callbackURL: `${window.location.origin}/`,
    }),
  });

  window.location.href = url;
}
