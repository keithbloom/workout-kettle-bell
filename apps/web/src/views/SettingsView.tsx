import { Link } from 'react-router';
import { useHistory } from '../api/queries';
import { ensureAudio, playSound, speak, vibrate } from '../player/cues';
import { useSettings, type Settings } from '../settings/useSettings';
import { plural } from '../lib/format';

const TOGGLES: { key: keyof Settings; label: string; hint: string }[] = [
  { key: 'sound', label: 'Sound', hint: 'Beeps for the last three seconds and at every change.' },
  {
    key: 'vibrate',
    label: 'Vibration',
    hint: 'A buzz at every change. Works on most Android phones.',
  },
  { key: 'voice', label: 'Voice', hint: 'Says each exercise out loud.' },
  { key: 'awake', label: 'Keep screen on', hint: 'Stops your phone sleeping during a session.' },
];

export function SettingsView() {
  const { settings, toggle } = useSettings();
  const history = useHistory();

  const test = () => {
    ensureAudio();
    if (settings.sound) {
      playSound('go');
      setTimeout(() => playSound('rest'), 400);
    }
    if (settings.vibrate) vibrate(120);
    if (settings.voice) speak('Sound check');
  };

  return (
    <section className="view">
      <h1>Settings</h1>
      <p className="lede">Choose how the timer gets your attention.</p>

      {TOGGLES.map(({ key, label, hint }) => (
        <button
          key={key}
          type="button"
          className="set-row"
          role="switch"
          aria-checked={settings[key]}
          onClick={() => {
            toggle(key);
            if (key === 'sound' || key === 'voice') ensureAudio();
          }}
        >
          <span>
            <b>{label}</b>
            <small>{hint}</small>
          </span>
          <span className="sw" />
        </button>
      ))}

      <div className="set-block">
        <button type="button" className="btn2" onClick={test}>
          Play test sound
        </button>
      </div>

      <div className="set-block">
        <h2>History</h2>
        <p>
          {history.data
            ? history.data.sessions.length
              ? `${plural(history.data.sessions.length, 'session')} completed, ${history.data.thisWeek} this week.`
              : 'No sessions yet.'
            : '—'}
        </p>
      </div>

      <div className="set-block">
        <h2>Account</h2>
        <p>Your name, your training so far, and signing out.</p>
        <Link to="/account" className="btn2">
          Go to your account
        </Link>
      </div>
    </section>
  );
}
