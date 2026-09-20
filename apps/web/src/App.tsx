import { Route, Routes } from 'react-router';
import { useCurrentUser } from './auth/useAuth.js';
import { Nav } from './components/Nav.js';
import { SignInView } from './views/SignInView.js';
import { SettingsView } from './views/SettingsView.js';
import { TimerView } from './views/TimerView.js';
import { WorkoutDetailView } from './views/WorkoutDetailView.js';
import { WorkoutsView } from './views/WorkoutsView.js';

/**
 * Sign-in is required, so the whole app is either the sign-in screen or the
 * signed-in one. There is no half state to reason about and no route that has
 * to remember whether it needs a user.
 */
export function App() {
  const user = useCurrentUser();

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
      <main>
        <Routes>
          <Route path="/" element={<WorkoutsView />} />
          <Route path="/workouts/:id" element={<WorkoutDetailView />} />
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
