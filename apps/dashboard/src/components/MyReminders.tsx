import type { ReminderChannel } from '@wagonwise/contracts/maintenance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as maintenanceApi from '../api/maintenance';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

const CHOICES: { value: ReminderChannel; label: string; detail: string }[] = [
  {
    value: 'email',
    label: 'Email me each morning',
    detail:
      'A short email from 7am while something is overdue or due soon. Nothing is sent on a quiet day.',
  },
  {
    value: 'none',
    label: 'Only show it in the portal',
    detail: 'No emails. Look at this page to see what is due.',
  },
];

/**
 * How the signed-in person is reminded about maintenance. Each person who books vehicles in chooses for themselves;
 * until they do, it is an email each morning. The portal always shows what is due, whichever they pick.
 */
export function MyReminders() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const key = ['my-reminders'] as const;

  const current = useQuery({
    queryKey: key,
    queryFn: () => withAccessToken((token) => maintenanceApi.getMyReminders(token)),
  });
  const save = useMutation({
    mutationFn: (channel: ReminderChannel) =>
      withAccessToken((token) => maintenanceApi.setMyReminders(token, channel)),
    onSuccess: (channel) => queryClient.setQueryData(key, channel),
  });

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
              checked={current.data === choice.value}
              disabled={save.isPending}
              onChange={() => save.mutate(choice.value)}
            />{' '}
            <strong>{choice.label}.</strong>{' '}
            <span style={{ color: 'var(--text-muted)' }}>{choice.detail}</span>
          </label>
        ))}
      {save.isError && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(save.error)}</p>}
    </section>
  );
}
