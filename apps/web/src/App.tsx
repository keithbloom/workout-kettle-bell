import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';
import { useCurrentUser } from './auth/useAuth';
import { useSync } from './offline/useSync';
import { plural } from './lib/format';
import { Nav } from './components/Nav';
import { SignInView } from './views/SignInView';
import { SettingsView } from './views/SettingsView';
import { TimerView } from './views/TimerView';
import { WorkoutDetailView } from './views/WorkoutDetailView';
import { WorkoutsView } from './views/WorkoutsView';

/*
 * The builder is loaded on demand. It pulls in the Zod contract, which is the
 * single largest thing in the bundle, and most visits are someone running a
 * workout rather than writing one. Its chunk is still precached by the service
 * worker, so building a workout offline keeps working.
 */
const BuilderView = lazy(() =>
  import('./builder/BuilderView').then((m) => ({ default: m.BuilderView })),
);

const Loading = () => (
  <section className="view">
    <p className="status">Loading…</p>
  </section>
);

/**
 * Sign-in is required, so the whole app is either the sign-in screen or the
 * signed-in one. There is no half state to reason about and no route that has
 * to remember whether it needs a user.
 */
export function App() {
  const user = useCurrentUser();
  const { waiting } = useSync();

  if (user.isPending) {
    return (
      <main>
        <section className="view">
          <p className="status">Loading…</p>
        </section>
      </main>
    );
  }

  if (!user.data) {
    return (
      <main>
        <SignInView allowPassword={import.meta.env.DEV} />
      </main>
    );
  }

  return (
    <>
      {waiting > 0 && (
        <p className="sync" role="status">
          {plural(waiting, 'session')} saved on this device, waiting for a connection.
        </p>
      )}
      <main>
        <Routes>
          <Route path="/" element={<WorkoutsView />} />
          <Route
            path="/workouts/new"
            element={
              <Suspense fallback={<Loading />}>
                <BuilderView mode="new" />
              </Suspense>
            }
          />
          <Route path="/workouts/:id" element={<WorkoutDetailView />} />
          <Route
            path="/workouts/:id/edit"
            element={
              <Suspense fallback={<Loading />}>
                <BuilderView mode="edit" />
              </Suspense>
            }
          />
          <Route
            path="/workouts/:id/copy"
            element={
              <Suspense fallback={<Loading />}>
                <BuilderView mode="copy" />
              </Suspense>
            }
          />
          <Route path="/timer" element={<TimerView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route
            path="*"
            element={
              <section className="view">
                <h1>Not found</h1>
              </section>
            }
          />
        </Routes>
      </main>
      <Nav />
    </>
  );
}
