import { Link } from 'react-router';
import { useCurrentUser } from '../auth/useAuth';
import { Avatar } from './Avatar';

/**
 * The account button in the top corner, on every signed-in screen.
 *
 * Small and out of the way — this is a workout app, not a social one — but
 * present, so it is always clear whose workouts these are.
 */
export function AccountLink() {
  const user = useCurrentUser();
  if (!user.data) return null;

  return (
    <Link to="/account" className="account-link" aria-label={`Account: ${user.data.name}`}>
      <Avatar user={user.data} size={32} />
      <span className="account-link-name">{user.data.name.split(/\s+/)[0]}</span>
    </Link>
  );
}
