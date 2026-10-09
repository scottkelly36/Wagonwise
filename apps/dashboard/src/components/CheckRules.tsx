import type { CheckSettingsDto } from '@wagonwise/contracts/checks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as checksApi from '../api/checks';
import * as hoursApi from '../api/hours';
import { retentionChoices } from '../lib/retention';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

/**
 * A firm's rules about sending a vehicle out, both off until it turns them on. Fleet managers change them; anyone at
 * the company can read them. They apply when a driver accepts a job on a vehicle: the daily check done first, and a
 * vehicle with a "do not drive" defect not yet marked fixed held back. A dispatcher moving a job is never held up.
 */
export function CheckRules({ companyId, canChange }: { companyId: string; canChange: boolean }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const key = ['check-settings', companyId] as const;

  const settings = useQuery({
    queryKey: key,
    queryFn: () => withAccessToken((token) => checksApi.getCheckSettings(token, companyId)),
  });
  const save = useMutation({
    mutationFn: (next: CheckSettingsDto) =>
      withAccessToken((token) => checksApi.updateCheckSettings(token, companyId, next)),
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
  });

  // Showing drivers' hours status on the live map: off until the firm chooses, and each driver still chooses for themselves.
  const hoursKey = ['hours-setting', companyId] as const;
  const hours = useQuery({
    queryKey: hoursKey,
    queryFn: () => withAccessToken((token) => hoursApi.getHoursSetting(token, companyId)),
  });
  const saveHours = useMutation({
    mutationFn: (enabled: boolean) =>
      withAccessToken((token) => hoursApi.setHoursSetting(token, companyId, enabled)),
    onSuccess: (enabled) => {
      queryClient.setQueryData(hoursKey, enabled);
      void queryClient.invalidateQueries({ queryKey: ['hours-status'] });
    },
  });

  const [saved, setSaved] = useState(false);
  const current = settings.data;
  const change = (next: CheckSettingsDto) => {
    setSaved(false);
    save.mutate(next, { onSuccess: () => setSaved(true) });
  };

  return (
    <section
      style={{
        margin: '16px 0 24px',
        padding: 16,
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Rules for sending a vehicle out</h2>
      {settings.isError && (
        <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(settings.error)}</p>
      )}
      {current !== undefined && (
        <>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={current.requiredBeforeJob}
              disabled={!canChange || save.isPending}
              onChange={(e) => change({ ...current, requiredBeforeJob: e.target.checked })}
            />{' '}
            <strong>Do the check before the job.</strong> A driver can&apos;t accept a job until the
            check lists for their vehicle are done today.
          </label>
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={current.blockOnDoNotDrive}
              disabled={!canChange || save.isPending}
              onChange={(e) => change({ ...current, blockOnDoNotDrive: e.target.checked })}
            />{' '}
            <strong>Hold back a vehicle with a &quot;do not drive&quot; defect.</strong> It
            can&apos;t be sent out until you mark the defect fixed on the Defects page.
          </label>
          <label style={{ display: 'block', marginTop: 16 }}>
            <strong>Keep check records for</strong>{' '}
            <select
              value={current.retentionMonths}
              disabled={!canChange || save.isPending}
              onChange={(e) => change({ ...current, retentionMonths: Number(e.target.value) })}
            >
              {retentionChoices(current.retentionMonths).map((c) => (
                <option key={c.months} value={c.months}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            After this, a check is deleted with its photos each day. You are in charge of these
            records, and WagonWise deletes them on your say. A check with a defect not yet fixed is
            kept until the defect is marked fixed.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            The two rules are off until you turn them on. A dispatcher moving a job is never held up
            by these.
            {!canChange && ' Fleet managers can change them.'}
          </p>
          {saved && <p style={{ color: '#15803d' }}>Saved.</p>}
          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '16px 0' }} />
          <label style={{ display: 'block' }}>
            <input
              type="checkbox"
              checked={hours.data === true}
              disabled={!canChange || hours.isPending || saveHours.isPending}
              onChange={(e) => saveHours.mutate(e.target.checked)}
            />{' '}
            <strong>Show drivers&apos; hours status on the live map.</strong> Drivers choose for
            themselves whether to share. Nothing is shown for a driver who has not agreed.
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            The status is a live guide the driver enters, not a record of hours; it is not stored as
            history and should not be used for pay or discipline. You remain responsible for your
            own drivers&apos;-hours records and for the lawful basis for any monitoring of your
            staff. Turning this off removes every status straight away.
          </p>
          {(hours.isError || saveHours.isError) && (
            <p style={{ color: 'var(--danger)' }}>
              {staffErrorMessage(hours.error ?? saveHours.error)}
            </p>
          )}
        </>
      )}
      {save.isError && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(save.error)}</p>}
    </section>
  );
}
