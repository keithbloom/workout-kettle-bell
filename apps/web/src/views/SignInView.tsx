import { useState, type FormEvent } from 'react';
import { startGoogleSignIn } from '../api/client';
import { useSignIn, useSignUp } from '../auth/useAuth';

/**
 * Sign in.
 *
 * Google is the way in. Email and password is shown only when the API offers it
 * — it exists so the tests have a way to authenticate without Google, and the
 * Worker leaves the provider switched off in production.
 */
export function SignInView({ allowPassword }: { allowPassword: boolean }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const [googlePending, setGooglePending] = useState(false);
  const [googleFailed, setGoogleFailed] = useState(false);

  const signIn = useSignIn();
  const signUp = useSignUp();
  const pending = signIn.isPending || signUp.isPending;
  const error = signIn.error ?? signUp.error;

  const google = async () => {
    setGooglePending(true);
    setGoogleFailed(false);
    try {
      await startGoogleSignIn();
    } catch {
      // Leaves us on this page rather than a blank one, with a way to retry.
      setGooglePending(false);
      setGoogleFailed(true);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'sign-in') signIn.mutate({ email, password });
    else signUp.mutate({ email, password, name });
  };

  return (
    <section className="view">
      <h1>Kettlebell and mat</h1>
      <p className="lede">
        Sign in to keep your workouts and history on every device you train with.
      </p>

      <div className="start-wrap" style={{ position: 'static' }}>
        <button type="button" className="cta" onClick={google} disabled={googlePending}>
          {googlePending ? 'Taking you to Google…' : 'Continue with Google'}
        </button>
        {googleFailed && (
          <p className="status" role="alert">
            Couldn&rsquo;t reach Google just then. Try again.
          </p>
        )}
      </div>

      {allowPassword && (
        <form onSubmit={submit} className="set-block" style={{ marginTop: 24 }}>
          <h2>{mode === 'sign-in' ? 'Or sign in with a password' : 'Create an account'}</h2>

          {mode === 'sign-up' && (
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span className="step-lbl">Name</span>
              <input
                className="btn2"
                style={{ width: '100%', marginTop: 6 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span className="step-lbl">Email</span>
            <input
              className="btn2"
              style={{ width: '100%', marginTop: 6 }}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <span className="step-lbl">Password</span>
            <input
              className="btn2"
              style={{ width: '100%', marginTop: 6 }}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {error && (
            <p className="status" role="alert">
              That didn&rsquo;t work. Check your details and try again.
            </p>
          )}

          <button type="submit" className="cta" disabled={pending}>
            {pending ? 'One moment…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            className="more"
            onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          >
            {mode === 'sign-in' ? 'Create an account instead' : 'I already have an account'}
          </button>
        </form>
      )}
    </section>
  );
}
