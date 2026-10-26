import type { ReminderCompanyChannel } from '@wagonwise/contracts/maintenance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as maintenanceApi from '../api/maintenance';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

const CHOICES: { value: ReminderCompanyChannel; label: string; detail: string }[] = [
  {
    value: 'email',
    label: 'Email',
    detail: 'A short email each morning while something is overdue or due soon.',
  },
  {
    value: 'text',
    label: 'Text message',
    detail:
      'One short text a day to each person who has added a mobile. Anyone without one gets the email instead.',
  },
  {
    value: 'both',
    label: 'Both',
    detail: 'The text and the email.',
  },
];

/**
 * How the company's maintenance reminders go: email, text or both. Each person still chooses whether to be reminded at all, and a
 * text goes to the UK mobile they add. A text costs WagonWise a few pence, so each company has a monthly limit; past it, reminders
 * go by email. Shown to those who book maintenance; changed by them.
 */
export function CompanyReminders({ companyId }: { companyId: string }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const key = ['reminder-settings', companyId] as const;

  const settings = useQuery({
    queryKey: key,
    queryFn: () => withAccessToken((token) => maintenanceApi.getReminderSettings(token, companyId)),
  });
  const save = useMutation({
    mutationFn: (channel: ReminderCompanyChannel) =>
      withAccessToken((token) => maintenanceApi.setReminderSettings(token, companyId, channel)),
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });

  const data = settings.data;
  return (
    <section
      style={{
        margin: '0 0 24px',
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <h2 style={{ marginTop: 0 }}>How your company is reminded</h2>
      {settings.isError && (
        <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(settings.error)}</p>
      )}
      {data !== undefined && (
        <>
          {CHOICES.map((choice) => (
            <label key={choice.value} style={{ display: 'block', marginBottom: 8 }}>
              <input
                type="radio"
                name="company-reminders"
                checked={data.channel === choice.value}
                disabled={save.isPending}
                onChange={() => save.mutate(choice.value)}
              />{' '}
              <strong>{choice.label}.</strong>{' '}
              <span style={{ color: 'var(--text-muted)' }}>{choice.detail}</span>
            </label>
          ))}
          {(data.channel === 'text' || data.channel === 'both') && (
            <p style={{ color: data.textsAvailable ? 'var(--text-muted)' : 'var(--warning)' }}>
              {data.textsAvailable
                ? `${data.textsThisMonth} of ${data.textLimit} texts used this month. After that, reminders go by email.`
                : 'Text messages are not set up yet, so reminders go by email for now.'}
            </p>
          )}
        </>
      )}
      {save.isError && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(save.error)}</p>}
    </section>
  );
}
