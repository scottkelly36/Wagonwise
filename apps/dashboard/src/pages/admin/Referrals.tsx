import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REFERRAL_REWARD_POUNDS, type StaffReferralDto } from '@wagonwise/contracts/referrals';
import { useState } from 'react';
import * as referralsApi from '../../api/referrals';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorNotice } from '../../components/ErrorNotice';
import { useConfirm, useNotify } from '../../components/feedback-context';
import { REFERRAL_STATUS_LABELS, nextActions, normaliseCode } from '../../lib/referrals';
import { useStaffAuthStore } from '../../state/staff-auth-store';

const KEY = ['referrals'] as const;

/**
 * Drivers recommending WagonWise to the firm they drive for, for WagonWise staff only. When a firm joins and names a driver's code,
 * record it here; once the firm pays its first bill, mark it paid; the driver then claims the gift card in the app, and you send it
 * to the email shown and mark it sent.
 */
export function Referrals() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const ask = useConfirm();
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => withAccessToken((token) => referralsApi.listReferrals(token)),
  });

  const [code, setCode] = useState('');
  const [firm, setFirm] = useState('');
  const [whose, setWhose] = useState<string | null | undefined>(undefined);

  const lookup = useMutation({
    mutationFn: () =>
      withAccessToken((token) => referralsApi.lookupCode(token, normaliseCode(code))),
    onSuccess: (found) => setWhose(found.driverLabel ?? 'a driver with no name set'),
    onError: () => setWhose(null),
  });
  const create = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        referralsApi.createReferral(token, { code: normaliseCode(code), firmName: firm.trim() }),
      ),
    onSuccess: (made) => {
      notify(`Recorded: ${made.firmName}, recommended by ${made.driverLabel ?? 'a driver'}.`);
      setCode('');
      setFirm('');
      setWhose(undefined);
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  const move = useMutation({
    mutationFn: (input: { id: string; to: 'reward_due' | 'sent' | 'void' }) =>
      withAccessToken((token) =>
        referralsApi.setReferralStatus(token, input.id, { status: input.to }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const columns: Column<StaffReferralDto>[] = [
    {
      key: 'when',
      header: 'Recorded',
      sortValue: (r) => r.createdAt,
      cell: (r) => new Date(r.createdAt).toLocaleDateString('en-GB'),
    },
    {
      key: 'firm',
      header: 'Firm',
      sortValue: (r) => r.firmName.toLowerCase(),
      cell: (r) => r.firmName,
    },
    {
      key: 'driver',
      header: 'Recommended by',
      sortValue: (r) => r.driverLabel ?? '',
      cell: (r) => (
        <>
          {r.driverLabel ?? 'A driver with no name set'}
          <span className="block text-muted text-13">{r.code}</span>
        </>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => (
        <>
          {REFERRAL_STATUS_LABELS[r.status]}
          {r.rewardEmail === null ? null : (
            <span className="block text-13">
              Send to <strong>{r.rewardEmail}</strong>
            </span>
          )}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <span
          style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}
        >
          {nextActions(r.status).map((a) => (
            <button
              key={a.to}
              type="button"
              className={a.to === 'void' ? undefined : 'btn-confirm'}
              disabled={move.isPending}
              onClick={() => {
                void ask({
                  message: `${a.label}: ${r.firmName}?`,
                  confirmLabel: a.label,
                }).then((ok) => {
                  if (ok) move.mutate({ id: r.id, to: a.to });
                });
              }}
            >
              {a.label}
            </button>
          ))}
        </span>
      ),
    },
  ];

  const error = list.error ?? create.error ?? move.error;
  return (
    <div>
      <h1>Referrals</h1>
      <p className="text-muted">
        Drivers recommend WagonWise to the firm they drive for with the code in their app (More,
        Recommend us to your boss). When a firm joins and names a code, record it here. Once the
        firm pays its first bill, mark it paid: the driver then gives an email in the app for their
        £{REFERRAL_REWARD_POUNDS} gift card, which shows here to send. One reward per firm, and only
        for a firm with at least two lorries that is not the driver's own.
      </p>
      {error !== null && error !== undefined && <ErrorNotice error={error} />}

      <form
        className="mb-16"
        onSubmit={(event) => {
          event.preventDefault();
          if (code.trim() !== '' && firm.trim() !== '') create.mutate();
        }}
      >
        <label className="block mb-16">
          <strong>Driver's code</strong>
          <span className="block text-muted text-13">For example WW-K7Q2MX.</span>
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setWhose(undefined);
            }}
            onBlur={() => {
              if (code.trim() !== '') lookup.mutate();
            }}
            style={{ width: 200 }}
          />
          {whose === undefined ? null : whose === null ? (
            <span className="block text-danger text-13">No driver has that code.</span>
          ) : (
            <span className="block text-13">This is {whose}'s code.</span>
          )}
        </label>
        <label className="block mb-16">
          <strong>Firm that joined</strong>
          <input
            value={firm}
            maxLength={120}
            onChange={(e) => setFirm(e.target.value)}
            style={{ width: '100%' }}
          />
        </label>
        <button
          type="submit"
          disabled={create.isPending || code.trim() === '' || firm.trim() === ''}
        >
          Record referral
        </button>
      </form>

      <DataTable
        columns={columns}
        rows={list.data?.referrals ?? []}
        rowKey={(r) => r.id}
        searchText={(r) => `${r.firmName} ${r.driverLabel ?? ''} ${r.code}`}
        emptyText="No referrals yet."
      />
    </div>
  );
}
