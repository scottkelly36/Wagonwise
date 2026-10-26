import type { MyRemindersDto, ReminderChannel } from '@wagonwise/contracts/maintenance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as maintenanceApi from '../api/maintenance';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

const CHOICES: { value: ReminderChannel; label: string; detail: string }[] = [
  {
    value: 'email',
    label: 'Remind me each morning',
    detail:
      'A short message from 7am while something is overdue or due soon: by email, text or both, as your company chooses. Nothing is sent on a quiet day.',
  },
  {
    value: 'none',
    label: 'Only show it in the portal',
    detail: 'No messages. Look at this page to see what is due.',
  },
];

/** Shows a mobile as people write it: +447700900123 as 07700 900123. */
function showMobile(mobile: string): string {
  return mobile.startsWith('+44') ? `0${mobile.slice(3, 7)} ${mobile.slice(7)}` : mobile;
}

/**
 * How the signed-in person is reminded about maintenance. Each person who books vehicles in chooses for themselves whether
 * to be reminded; until they do, they are. How (email, text or both) is the company's choice, and a text goes to the UK mobile
 * they add here. The portal always shows what is due, whichever they pick.
 */
export function MyReminders({ companyId }: { companyId: string | undefined }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const key = ['my-reminders'] as const;

  const current = useQuery({
    queryKey: key,
    queryFn: () => withAccessToken((token) => maintenanceApi.getMyReminders(token)),
  });
  const company = useQuery({
    queryKey: ['reminder-settings', companyId],
    queryFn: () =>
      withAccessToken((token) => maintenanceApi.getReminderSettings(token, companyId as string)),
    enabled: companyId !== undefined,
  });
  const save = useMutation({
    mutationFn: (update: { channel?: ReminderChannel; mobile?: string }) =>
      withAccessToken((token) => maintenanceApi.setMyReminders(token, update)),
    onSuccess: (saved: MyRemindersDto) => {
      queryClient.setQueryData(key, saved);
      setEditing(undefined);
    },
  });

  // What the person is typing; until they type, the box shows the number already saved.
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const savedMobile = current.data?.mobile;
  const shownSaved = savedMobile === undefined ? '' : showMobile(savedMobile);
  const mobile = editing ?? shownSaved;
  const texting = company.data?.channel === 'text' || company.data?.channel === 'both';
  const changed = mobile.trim() !== shownSaved;

  return (
    <section
      style={{
        margin: '0 0 24px',
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Your reminders</h2>
      {current.isError && (
        <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(current.error)}</p>
      )}
      {current.data !== undefined &&
        CHOICES.map((choice) => (
          <label key={choice.value} style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="radio"
              name="reminders"
              checked={current.data.channel === choice.value}
              disabled={save.isPending}
              onChange={() => save.mutate({ channel: choice.value })}
            />{' '}
            <strong>{choice.label}.</strong>{' '}
            <span style={{ color: 'var(--text-muted)' }}>{choice.detail}</span>
          </label>
        ))}

      {current.data !== undefined && (
        <div className="field" style={{ marginTop: 12, maxWidth: 360 }}>
          <label htmlFor="reminder-mobile">Your mobile, for reminder texts (UK mobiles only)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="reminder-mobile"
              value={mobile}
              onChange={(e) => setEditing(e.target.value)}
              placeholder="e.g. 07700 900123"
              inputMode="tel"
              autoComplete="tel"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              disabled={!changed || save.isPending}
              onClick={() => save.mutate({ mobile: mobile.trim() })}
            >
              {mobile.trim() === '' && savedMobile !== undefined ? 'Remove' : 'Save'}
            </button>
          </div>
          <small style={{ color: 'var(--text-muted)' }}>
            {texting && savedMobile === undefined
              ? 'Your company sends reminders by text, but you have no mobile saved, so you get the email instead.'
              : texting
                ? 'Your company sends reminders by text. Yours go to this number.'
                : 'Only used if your company chooses text reminders. It is used for nothing else.'}
          </small>
        </div>
      )}
      {save.isError && <p style={{ color: 'var(--danger)' }}>{staffMessage(save.error)}</p>}
    </section>
  );
}

function staffMessage(error: unknown): string {
  // A number that is not a UK mobile comes back as InvalidMobile; say what to do rather than the code.
  if (error instanceof Error && error.message.includes('InvalidMobile')) {
    return 'That is not a UK mobile number. It should start 07, like 07700 900123.';
  }
  return staffErrorMessage(error);
}
