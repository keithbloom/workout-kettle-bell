import { useCurrentUser, useSignOut } from '../auth/useAuth';
import { useHistory } from '../api/queries';
import { formatDuration, plural } from '../lib/format';
import { Avatar } from './Avatar';

/** Who you are, what you have done, and the way out. */
export function AccountView() {
  const user = useCurrentUser();
  const history = useHistory();
  const signOut = useSignOut();

  if (!user.data) {
    return (
      <section className="view">
        <p className="status">Loading…</p>
      </section>
    );
  }

  const sessions = history.data?.sessions ?? [];
  const totalSeconds = sessions.reduce((total, s) => total + s.activeSeconds, 0);

  return (
    <section className="view">
      <h1>Account</h1>

      <div className="account-head">
        <Avatar user={user.data} size={72} />
        <div>
          <p className="account-name">{user.data.name}</p>
          <p className="account-email">{user.data.email}</p>
        </div>
      </div>

      <div className="set-block">
        <h2>Training</h2>
        <p>
          {sessions.length
            ? `${plural(sessions.length, 'session')} completed, ${history.data?.thisWeek ?? 0} this week, ${formatDuration(totalSeconds)} in total.`
            : 'No sessions yet.'}
        </p>
      </div>

      <div className="set-block">
        <h2>Signing out</h2>
        <p>
          Your workouts stay on your account. Anything finished but not yet synced is sent first.
        </p>
        <button
          type="button"
          className="btn2 danger"
          onClick={() => signOut.mutate()}
          disabled={signOut.isPending}
        >
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </section>
  );
}
