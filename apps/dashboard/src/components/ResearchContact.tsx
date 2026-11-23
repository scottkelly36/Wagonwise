import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as feedbackApi from '../api/feedback';
import { NOTE_DISMISSED_KEY, researchAnswerText, showResearchNote } from '../lib/research-contact';
import { isPlatform } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { ErrorNotice } from './ErrorNotice';

const KEY = ['research-contact'] as const;

/** The person's own answer and the wording. Only for a company's staff, and only while the option is switched on; never fails a page. */
function useResearchContact() {
  const staff = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  return useQuery({
    queryKey: KEY,
    queryFn: () => withAccessToken((token) => feedbackApi.getResearchContact(token)),
    enabled: staff !== undefined && !isPlatform(staff),
    retry: false,
  });
}

/**
 * "WagonWise may contact me from time to time to ask for feedback." An option, never a condition: unticked until the person ticks it, and
 * one click withdraws it. What is stored is the answer, the date and the version of the wording shown. Hidden while the option is off.
 */
export function ResearchContactSwitch() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const state = useResearchContact();
  const save = useMutation({
    mutationFn: (input: { agreed: boolean; version: number }) =>
      withAccessToken((token) =>
        feedbackApi.setResearchContact(token, input.agreed, input.version),
      ),
    onSuccess: (saved) => queryClient.setQueryData(KEY, saved),
    // The wording changed while the page was open: show the new one.
    onError: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const data = state.data;
  if (data === undefined || !data.available) return null;
  const said = researchAnswerText(data.agreed, data.at);

  return (
    <section className="card" style={{ maxWidth: 640, marginTop: 16 }}>
      <h2>Helping us improve WagonWise</h2>
      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={data.agreed === true}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ agreed: e.target.checked, version: data.version })}
          style={{ marginTop: 4 }}
        />
        <span>{data.text}</span>
      </label>
      <p className="muted" style={{ margin: '8px 0 0' }}>
        {data.note}
      </p>
      {said !== undefined && (
        <p role="status" style={{ margin: '8px 0 0' }}>
          {said}
        </p>
      )}
      {save.isError && <ErrorNotice error={save.error} />}
    </section>
  );
}

/**
 * A one-time note on the Overview for someone who has not been asked yet: where to find the switch. Goes away when they answer or put
 * it away, and is never shown while the option is off. Nobody is emailed to ask.
 */
export function ResearchNote() {
  const state = useResearchContact();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(NOTE_DISMISSED_KEY) === 'yes';
    } catch {
      return false;
    }
  });
  if (!showResearchNote(state.data, dismissed)) return null;
  return (
    <section
      role="note"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '6px solid var(--blue-600)',
        borderRadius: 8,
        marginBottom: 16,
        padding: '10px 14px',
      }}
    >
      Would you help us improve WagonWise? You can say whether we may ask you for feedback from time
      to time in <Link to="/staff/settings">Settings</Link>. It is optional.{' '}
      <button
        type="button"
        className="link-button"
        onClick={() => {
          try {
            localStorage.setItem(NOTE_DISMISSED_KEY, 'yes');
          } catch {
            // Private mode: it is put away for this visit only.
          }
          setDismissed(true);
        }}
      >
        Not now
      </button>
    </section>
  );
}
