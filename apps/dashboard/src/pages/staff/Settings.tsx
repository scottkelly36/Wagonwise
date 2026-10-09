import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as companiesApi from '../../api/companies';
import { CompanySelect } from '../../components/CompanySelect';
import { retentionChoices } from '../../lib/retention';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from './messages';

/**
 * Settings: the choices a company makes about its own data. For now, how long delivery photos are kept. The
 * company is the controller of its delivery records, so it chooses, and WagonWise deletes on that instruction
 * (a daily task). Managers (`manage_users`) change it; WagonWise staff can too. The job record stays when a
 * photo goes.
 */
export function Settings() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const canEdit = everyCompany || holds(me, 'manage_users');
  const queryClient = useQueryClient();

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const key = ['company-settings', companyId] as const;

  const settings = useQuery({
    queryKey: key,
    queryFn: () =>
      withAccessToken((token) => companiesApi.getCompanySettings(token, companyId as string)),
    enabled: companyId !== undefined,
  });
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const current = settings.data?.photoRetentionMonths;
  const shown = chosen ?? current;

  const save = useMutation({
    mutationFn: (months: number) =>
      withAccessToken((token) =>
        companiesApi.updateCompanySettings(token, companyId as string, {
          photoRetentionMonths: months,
        }),
      ),
    onSuccess: () => {
      setChosen(undefined);
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const error = settings.error ?? save.error;

  return (
    <div>
      <h1>Settings</h1>
      <p className="muted">Choices your company makes about its own data.</p>

      {everyCompany && (
        <div className="report-filters">
          <label>
            Company{' '}
            <CompanySelect
              id="settings-company"
              value={selectedCompanyId}
              onChange={(id) => {
                setSelectedCompanyId(id);
                setChosen(undefined);
              }}
              emptyLabel="— choose a company —"
            />
          </label>
        </div>
      )}
      {error !== null && error !== undefined && <p className="error">{staffErrorMessage(error)}</p>}

      {companyId !== undefined && (
        <section className="card" style={{ maxWidth: 640 }}>
          <h2>How long delivery photos are kept</h2>
          <p>
            Photos of deliveries are deleted automatically once they are older than this. The job
            itself stays: only the photo goes. If you need to keep proof for longer, download what
            you need before then. You are the controller of your delivery records, so this is your
            choice; WagonWise deletes on your instruction.
          </p>
          {settings.isPending ? (
            <p>Loading…</p>
          ) : (
            <>
              <label htmlFor="photo-retention">Keep photos for</label>{' '}
              <select
                id="photo-retention"
                value={shown ?? 12}
                disabled={!canEdit || save.isPending}
                onChange={(e) => setChosen(Number(e.target.value))}
              >
                {retentionChoices(current).map((c) => (
                  <option key={c.months} value={c.months}>
                    {c.label}
                  </option>
                ))}
              </select>{' '}
              {canEdit && (
                <button
                  className="btn-primary"
                  type="button"
                  disabled={save.isPending || chosen === undefined || chosen === current}
                  onClick={() => chosen !== undefined && save.mutate(chosen)}
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </button>
              )}
              {!canEdit && <p className="muted">Only your company's managers can change this.</p>}
            </>
          )}
        </section>
      )}
    </div>
  );
}
