import type { SecondFactorMethod } from '@wagonwise/contracts/staff';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as staffApi from '../../api/staff';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from './messages';

const CODE_HINTS: Record<SecondFactorMethod, string> = {
  totp: 'Enter the 6-digit code from your authenticator app.',
  sms: "We've texted you a 6-digit code.",
  email: "We've emailed you a 6-digit code.",
};

/**
 * Staff sign-in (P2-M1.10): email and password, then the second factor chosen when the account
 * was set up. A lost device: any of the account's recovery codes works in place of the code.
 */
export function StaffSignIn() {
  const navigate = useNavigate();
  const signIn = useStaffAuthStore((s) => s.signIn);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<
    { readonly id: string; readonly method: SecondFactorMethod } | undefined
  >(undefined);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function submitPassword(): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      const result = await staffApi.signIn(email.trim(), password);
      setChallenge({ id: result.challengeId, method: result.method });
      setPassword('');
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function submitCode(): Promise<void> {
    if (challenge === undefined) return;
    setError(undefined);
    setPending(true);
    try {
      const tokens = await staffApi.verifySecondFactor(challenge.id, code.trim());
      signIn(tokens);
      navigate('/staff/users');
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ maxWidth: 340, margin: '80px auto' }}>
      <h1>Staff sign-in</h1>

      {challenge === undefined ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitPassword();
          }}
        >
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={fieldStyle}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={fieldStyle}
          />
          <button type="submit" disabled={pending || email === '' || password === ''}>
            {pending ? 'Checking…' : 'Continue'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode();
          }}
        >
          <p>{CODE_HINTS[challenge.method]}</p>
          <label htmlFor="code">Code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={fieldStyle}
          />
          <p style={{ fontSize: 13, color: '#6b7280' }}>
            Lost your device? Enter one of your recovery codes instead.
          </p>
          <button type="submit" disabled={pending || code.trim() === ''}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>{' '}
          <button
            type="button"
            onClick={() => {
              setChallenge(undefined);
              setCode('');
              setError(undefined);
            }}
          >
            Start again
          </button>
        </form>
      )}

      {error !== undefined && <p style={{ color: '#dc2626' }}>{error}</p>}

      <p style={{ marginTop: 32, fontSize: 13 }}>
        <Link to="/sign-in">Driver account sign-in</Link>
      </p>
    </div>
  );
}

const fieldStyle = { display: 'block', width: '100%', marginBottom: 12 } as const;
