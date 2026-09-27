import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as identityApi from '../api/identity';
import { ApiError } from '../api/errors';
import { useAuthStore } from '../state/auth-store';

/** Real OTP sign-in, reusing the same flow driver-app uses — the dashboard has no separate
 *  business/dispatcher auth model (that's still undecided, see the rest of this app's earlier
 *  placeholders), so an admin dashboard user is just an existing `Driver` whose `isAdmin` is
 *  true. A non-admin can still complete OTP (core doesn't know this is the admin dashboard when
 *  verifying a code), but gets rejected here client-side, and would get a real 403 from every
 *  endpoint this app calls regardless. */
export function SignIn() {
  const navigate = useNavigate();
  const signIn = useAuthStore((s) => s.signIn);

  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'identifier' | 'code'>('identifier');
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function handleRequestCode(): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      await identityApi.requestOtp(identifier);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.tag : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  async function handleVerifyCode(): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      const result = await identityApi.verifyOtp(identifier, code);
      if (!result.driver.isAdmin) {
        setError("This account doesn't have admin access.");
        return;
      }
      signIn(result.accessToken, result.driver);
      navigate('/fleet');
    } catch (err) {
      setError(err instanceof ApiError ? err.tag : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>Sign in</h1>

      {step === 'identifier' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleRequestCode();
          }}
        >
          <label htmlFor="identifier">Phone or email</label>
          <input
            id="identifier"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: 12 }}
          />
          <button type="submit" disabled={pending || identifier.length === 0}>
            {pending ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleVerifyCode();
          }}
        >
          <label htmlFor="code">Code</label>
          <input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: 12 }}
          />
          <button type="submit" disabled={pending || code.length === 0}>
            {pending ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
      )}

      {error !== undefined && <p style={{ color: '#dc2626' }}>{error}</p>}
    </div>
  );
}
