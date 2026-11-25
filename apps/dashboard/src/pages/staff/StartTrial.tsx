import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { TrialLinkPreview } from '@wagonwise/contracts/signups';
import * as staffApi from '../../api/staff';
import { startTrialOutcome } from '../../lib/start-trial';
import { staffErrorMessage } from './messages';

type Done = ReturnType<typeof startTrialOutcome>;

/**
 * The page a firm's emailed link opens: "Start your free trial". The link proves the address is theirs, so pressing the button starts the
 * trial with no one at WagonWise involved. It starts only on the press, never when the page loads: some company mail systems open every
 * link in an email to scan it, and that must not start a trial. A firm registered with no name is asked for one here.
 */
export function StartTrial() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [preview, setPreview] = useState<TrialLinkPreview | undefined>(undefined);
  const [company, setCompany] = useState('');
  const [done, setDone] = useState<Done | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (token === '') {
      setPreview({ valid: false });
      return;
    }
    let cancelled = false;
    staffApi
      .previewTrialLink(token)
      .then((found) => {
        if (!cancelled) setPreview(found);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(staffErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function press(): Promise<void> {
    setError(undefined);
    setPending(true);
    try {
      const result = await staffApi.startTrial(token, company.trim() === '' ? undefined : company);
      if (result.status === 'needs_company') {
        setError('Please tell us the name of your firm.');
      } else {
        setDone(startTrialOutcome(result.status, preview?.email));
      }
    } catch (err) {
      setError(staffErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const heading = <h1>Start your free trial</h1>;
  if (done !== undefined) {
    return (
      <div style={{ maxWidth: 420, margin: '80px auto' }}>
        <h1>{done.title}</h1>
        <p role="status">{done.text}</p>
        {done.signIn && (
          <p>
            <Link to="/staff/sign-in">Sign in</Link>
          </p>
        )}
      </div>
    );
  }
  if (preview === undefined) {
    return (
      <div style={{ maxWidth: 420, margin: '80px auto' }}>
        {heading}
        {error === undefined ? <p>Checking your link…</p> : <p className="text-danger">{error}</p>}
      </div>
    );
  }
  if (!preview.valid) {
    const outcome = startTrialOutcome('invalid', undefined);
    return (
      <div style={{ maxWidth: 420, margin: '80px auto' }}>
        <h1>{outcome.title}</h1>
        <p>{outcome.text}</p>
      </div>
    );
  }
  if (preview.started === true) {
    const outcome = startTrialOutcome('already_started', preview.email);
    return (
      <div style={{ maxWidth: 420, margin: '80px auto' }}>
        <h1>{outcome.title}</h1>
        <p>{outcome.text}</p>
        <p>
          <Link to="/staff/sign-in">Sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: '80px auto' }}>
      {heading}
      <p>
        This confirms <strong>{preview.email}</strong> and opens your WagonWise trial: the fleet
        portal with room for 5 vehicles, free while you try it, with no card needed. We will email
        an invitation so you can choose your password.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void press();
        }}
      >
        {preview.needsCompany === true && (
          <>
            <label htmlFor="company">Your firm&apos;s name</label>
            <input
              id="company"
              type="text"
              autoComplete="organization"
              maxLength={120}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={{ display: 'block', width: '100%', marginBottom: 12 }}
            />
          </>
        )}
        {preview.company !== undefined && (
          <p>
            Firm: <strong>{preview.company}</strong>
          </p>
        )}
        {error !== undefined && <p className="text-danger">{error}</p>}
        <button
          type="submit"
          className="btn-primary"
          disabled={pending || (preview.needsCompany === true && company.trim() === '')}
        >
          {pending ? 'Starting…' : 'Start my trial'}
        </button>
      </form>
    </div>
  );
}
