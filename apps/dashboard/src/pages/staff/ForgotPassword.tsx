import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as staffApi from '../../api/staff';
import { staffErrorMessage } from './messages';

/**
 * "Forgot your password": asks for the address and says the same thing whether or not it has an account, so the page cannot be used to
 * find out who is a customer. The email carries a link to choose a new one (`/reset-password`).
 */
export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      await staffApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ maxWidth: 340, margin: '80px auto' }}>
      <h1>Forgot your password?</h1>
      {sent ? (
        <>
          <p role="status">
            If that address has a WagonWise account, we have emailed it a link to choose a new
            password. It works for an hour. Check your spam folder if it does not arrive.
          </p>
          <p>
            You will still be asked for your usual sign-in check afterwards. If you have lost that
            as well, use one of your recovery codes.
          </p>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p>Enter the email address you sign in with and we will send you a link.</p>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: 12 }}
          />
          <button type="submit" disabled={pending || email.trim() === ''}>
            {pending ? 'Sending…' : 'Email me a link'}
          </button>
        </form>
      )}
      {error !== undefined && <p className="text-danger">{error}</p>}
      <p style={{ marginTop: 32, fontSize: 13 }}>
        <Link to="/staff/sign-in">Back to sign-in</Link>
      </p>
    </div>
  );
}
