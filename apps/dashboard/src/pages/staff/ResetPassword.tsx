import { PASSWORD_MIN_LENGTH } from '@wagonwise/contracts/staff';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as staffApi from '../../api/staff';
import { staffErrorMessage } from './messages';

/** Choosing a new password from the emailed link (`/reset-password?token=…`). Works once; the next sign-in still asks for the usual check. */
export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const problem =
    password.length > 0 && password.length < PASSWORD_MIN_LENGTH
      ? `At least ${PASSWORD_MIN_LENGTH} characters.`
      : repeat.length > 0 && repeat !== password
        ? "The two passwords don't match."
        : undefined;

  async function submit(): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      await staffApi.resetPassword(token, password);
      setPassword('');
      setRepeat('');
      setDone(true);
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const frame = { maxWidth: 340, margin: '80px auto' } as const;

  if (token === '') {
    return (
      <div style={frame}>
        <h1>Choose a new password</h1>
        <p>This page needs the link from your email. Please open that link again.</p>
        <p>
          <Link to="/forgot-password">Ask for a new link</Link>
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div style={frame}>
        <h1>Password changed</h1>
        <p role="status">
          Your new password is set, and you have been signed out everywhere. Sign in with it now.
          You will be asked for your usual sign-in check as well.
        </p>
        <p>
          <Link to="/staff/sign-in">Go to sign-in</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={frame}>
      <h1>Choose a new password</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label htmlFor="password">New password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={fieldStyle}
        />
        <label htmlFor="repeat">Type it again</label>
        <input
          id="repeat"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          style={fieldStyle}
        />
        {problem !== undefined && <p className="text-13 text-muted">{problem}</p>}
        <button
          type="submit"
          disabled={pending || password.length < PASSWORD_MIN_LENGTH || repeat !== password}
        >
          {pending ? 'Saving…' : 'Save new password'}
        </button>
      </form>
      {error !== undefined && (
        <p className="text-danger">
          {error} <Link to="/forgot-password">Ask for a new link</Link>
        </p>
      )}
    </div>
  );
}

const fieldStyle = { display: 'block', width: '100%', marginBottom: 12 } as const;
