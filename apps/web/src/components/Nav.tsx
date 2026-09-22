import { NavLink } from 'react-router';
import { SettingsIcon, TimerIcon, WorkoutIcon } from './icons';

/** The bottom tab bar, thumb-reachable the way the original was. */
export function Nav() {
  return (
    <nav className="nav" aria-label="Main">
      <NavLink to="/" end>
        <WorkoutIcon />
        Workout
      </NavLink>
      <NavLink to="/timer">
        <TimerIcon />
        Interval timer
      </NavLink>
      <NavLink to="/settings">
        <SettingsIcon />
        Settings
      </NavLink>
    </nav>
  );
}
