import {
  PASSWORD_MIN_LENGTH,
  type ConfirmStaffEnrolmentResponse,
  type SecondFactorMethod,
} from '@wagonwise/contracts/staff';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as staffApi from '../../api/staff';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from './messages';

type Step =
  | { readonly kind: 'details' }
  | {
      readonly kind: 'code';
      readonly enrolmentId: string;
      readonly method: SecondFactorMethod;
      readonly totpUri?: string;
    }
  | { readonly kind: 'recovery'; readonly result: ConfirmStaffEnrolmentResponse };

/** The secret inside an `otpauth://totp/...?secret=...` link, for typing into an app by hand. */
function totpSecret(uri: string): string | undefined {
  try {
    return new URL(uri).searchParams.get('secret') ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Joining from an invite link (`/join?token=…`, P2-M1.10): choose a password and a second factor,
 * prove the factor works with its first code, then save the recovery codes, shown this once.
 * The account only exists once the code checks out.
 */
export function Join() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get('token') ?? '';
  const signIn = useStaffAuthStore((s) => s.signIn);

  const [step, setStep] = useState<Step>({ kind: 'details' });
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [method, setMethod] = useState<SecondFactorMethod>('totp');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const passwordProblem =
    password.length > 0 && password.length < PASSWORD_MIN_LENGTH
      ? `At least ${PASSWORD_MIN_LENGTH} characters.`
      : repeat.length > 0 && repeat !== password
        ? "The two passwords don't match."
        : undefined;

  async function submitDetails(): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      const result = await staffApi.acceptInvite({
        inviteToken,
        password,
        secondFactorMethod: method,
        ...(method === 'sms' ? { phone: phone.trim() } : {}),
      });
      setStep({
        kind: 'code',
        enrolmentId: result.enrolmentId,
        method: result.secondFactorMethod,
        ...(result.totpUri === undefined ? {} : { totpUri: result.totpUri }),
      });
      setPassword('');
      setRepeat('');
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function submitCode(enrolmentId: string): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      const result = await staffApi.confirmEnrolment(enrolmentId, code.trim());
      setStep({ kind: 'recovery', result });
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  if (inviteToken === '') {
    return (
      <div style={pageStyle}>
        <h1>Join WagonWise</h1>
        <p>This page needs the link from your invite email. Please open that link again.</p>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <h1>Join WagonWise</h1>

      {step.kind === 'details' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitDetails();
          }}
        >
          <label htmlFor="password">Choose a password</label>
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
          {passwordProblem !== undefined && <p style={hintStyle}>{passwordProblem}</p>}

          <fieldset style={{ border: 'none', padding: 0, margin: '12px 0' }}>
            <legend>How should we check it's you when you sign in?</legend>
            {(
              [
                ['totp', 'An authenticator app (recommended)'],
                ['sms', 'A code by text message'],
                ['email', 'A code by email'],
              ] as const
            ).map(([value, label]) => (
              <label key={value} style={{ display: 'block' }}>
                <input
                  type="radio"
                  name="method"
                  value={value}
                  checked={method === value}
                  onChange={() => setMethod(value)}
                />{' '}
                {label}
              </label>
            ))}
          </fieldset>

          {method === 'sms' && (
            <>
              <label htmlFor="phone">UK mobile number (+447…)</label>
              <input
                id="phone"
                type="tel"
                placeholder="+447700900123"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={fieldStyle}
              />
            </>
          )}

          <button
            type="submit"
            disabled={
              pending ||
              password.length < PASSWORD_MIN_LENGTH ||
              repeat !== password ||
              (method === 'sms' && phone.trim() === '')
            }
          >
            {pending ? 'Setting up…' : 'Continue'}
          </button>
        </form>
      )}

      {step.kind === 'code' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitCode(step.enrolmentId);
          }}
        >
          {step.method === 'totp' ? (
            <>
              <p>
                Add WagonWise to your authenticator app (Google Authenticator, Microsoft
                Authenticator, 1Password…). On this device you can{' '}
                <a href={step.totpUri}>open it in your app</a>; otherwise choose "enter a setup key"
                and type:
              </p>
              <p style={{ fontFamily: 'monospace', fontSize: 16, wordBreak: 'break-all' }}>
                {step.totpUri === undefined ? '' : totpSecret(step.totpUri)}
              </p>
              <p>Then enter the 6-digit code it shows.</p>
            </>
          ) : (
            <p>We've sent a 6-digit code by {step.method === 'sms' ? 'text message' : 'email'}.</p>
          )}
          <label htmlFor="code">Code</label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={fieldStyle}
          />
          <button type="submit" disabled={pending || !/^\d{6}$/.test(code.trim())}>
            {pending ? 'Checking…' : 'Finish'}
          </button>
        </form>
      )}

      {step.kind === 'recovery' && (
        <div>
          <p>
            <strong>Save these recovery codes somewhere safe.</strong> If you can't get a sign-in
            code (a lost phone, say), each one works once in its place. They won't be shown again.
          </p>
          <ol style={{ fontFamily: 'monospace', fontSize: 16 }}>
            {step.result.recoveryCodes.map((recoveryCode) => (
              <li key={recoveryCode}>{recoveryCode}</li>
            ))}
          </ol>
          <button
            onClick={() => {
              signIn({
                accessToken: step.result.accessToken,
                refreshToken: step.result.refreshToken,
                staff: step.result.staff,
              });
              navigate('/');
            }}
          >
            I've saved them, continue
          </button>
        </div>
      )}

      {error !== undefined && <p style={{ color: '#dc2626' }}>{error}</p>}
    </div>
  );
}

const pageStyle = { maxWidth: 420, margin: '60px auto' } as const;
const fieldStyle = { display: 'block', width: '100%', marginBottom: 12 } as const;
const hintStyle = { color: '#b45309', fontSize: 13, marginTop: -6 } as const;
