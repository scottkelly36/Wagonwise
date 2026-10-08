import type { CheckSettingsDto } from '@wagonwise/contracts/checks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as checksApi from '../api/checks';
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

  const [saved, setSaved] = useState(false);
  const current = settings.data;
  const change = (next: CheckSettingsDto) => {
    setSaved(false);
    save.mutate(next, { onSuccess: () => setSaved(true) });
  };

  return (
    <section
      style={{ margin: '16px 0 24px', padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}
    >
      <h2 style={{ marginTop: 0 }}>Rules for sending a vehicle out</h2>
      {settings.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(settings.error)}</p>}
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
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            Both are off until you turn them on. A dispatcher moving a job is never held up by
            these.
            {!canChange && ' Fleet managers can change them.'}
          </p>
          {saved && <p style={{ color: '#15803d' }}>Saved.</p>}
        </>
      )}
      {save.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(save.error)}</p>}
    </section>
  );
}
