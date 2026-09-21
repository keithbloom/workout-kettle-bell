import { Link } from 'react-router';
import { useHistory, useWorkouts } from '../api/queries.js';
import { plural } from '../lib/format.js';

/** The workouts you can run: the built-in templates, plus your own. */
export function WorkoutsView() {
  const workouts = useWorkouts();
  const history = useHistory();

  return (
    <section className="view">
      <h1>Workouts</h1>
      <p className="lede">Pick a session, or build your own from the exercise library.</p>

      <p className="hist">
        {history.data
          ? history.data.sessions.length
            ? `${plural(history.data.thisWeek, 'session')} this week, ${history.data.sessions.length} in total.`
            : 'No sessions yet.'
          : ''}
      </p>

      <div className="row-actions">
        <Link to="/workouts/new" className="btn2">
          Build a workout
        </Link>
      </div>

      {workouts.isPending && <p className="status">Loading…</p>}

      {workouts.error && (
        <p className="status" role="alert">
          Couldn&rsquo;t load your workouts. Check your connection and try again.
        </p>
      )}

      {workouts.data?.map((workout) => (
        <article className="band" data-phase="strength" key={workout.id}>
          <Link
            to={`/workouts/${workout.id}`}
            className="band-head"
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <span>
              <span className="band-name">{workout.name}</span>
              <span className="band-moves">{workout.description}</span>
            </span>
            <span className="band-min">{workout.isTemplate ? 'Built in' : 'Yours'}</span>
            <span />
          </Link>
        </article>
      ))}
    </section>
  );
}
