import type { DefectDto, DefectStatus } from '@wagonwise/contracts/checks';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as checksApi from '../../api/checks';
import * as maintenanceApi from '../../api/maintenance';
import { CompanySelect } from '../../components/CompanySelect';
import { DataTable, type Column } from '../../components/DataTable';
import { STATUS_LABELS, whenText } from '../../lib/check-results';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

type Filter = 'todo' | DefectStatus;

const FILTER_LABELS: Record<Filter, string> = {
  todo: 'Still to deal with',
  open: 'Open only',
  acknowledged: 'Seen',
  fixed: 'Fixed',
};

const NEXT_STEPS: Record<DefectStatus, { to: DefectStatus; label: string }[]> = {
  open: [
    { to: 'acknowledged', label: 'Mark seen' },
    { to: 'fixed', label: 'Mark fixed' },
  ],
  acknowledged: [
    { to: 'fixed', label: 'Mark fixed' },
    { to: 'open', label: 'Reopen' },
  ],
  fixed: [{ to: 'open', label: 'Reopen' }],
};

/**
 * Defects: what drivers' walk-round checks found. A "do not drive" defect is listed first. Fleet managers and
 * dispatchers mark each one seen, then fixed; anyone who can see reports can read the list.
 */
export function Defects() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const canHandle = everyCompany || holds(me, 'manage_fleet') || holds(me, 'dispatch');
  const queryClient = useQueryClient();

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const companyId = everyCompany ? selectedCompanyId || undefined : me?.companyId;
  const [filter, setFilter] = useState<Filter>('todo');
  const key = ['check-defects', companyId, filter] as const;

  const defects = useQuery({
    queryKey: key,
    queryFn: () =>
      withAccessToken((token) =>
        checksApi.listDefects(token, companyId as string, filter === 'todo' ? undefined : filter),
      ),
    enabled: companyId !== undefined,
  });
  const change = useMutation({
    mutationFn: ({ id, to }: { id: string; to: DefectStatus }) =>
      withAccessToken((token) => checksApi.setDefectStatus(token, id, { status: to })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['check-defects'] }),
  });

  // Whoever keeps maintenance can book a defect in for repair; the repairs already booked show against each defect.
  const canBook = everyCompany || holds(me, 'manage_maintenance');
  const [booking, setBooking] = useState<DefectDto | undefined>(undefined);
  const [dueDate, setDueDate] = useState('');
  const repairs = useQuery({
    queryKey: ['repairs', companyId, 'open'],
    queryFn: () =>
      withAccessToken((token) => maintenanceApi.listRepairs(token, companyId as string, 'open')),
    enabled: companyId !== undefined && canBook,
  });
  const bookedFor = new Map((repairs.data ?? []).map((r) => [r.defectId, r]));
  const book = useMutation({
    mutationFn: (input: { defectId: string; dueDate: string }) =>
      withAccessToken((token) => maintenanceApi.bookRepair(token, input.defectId, input.dueDate)),
    onSuccess: () => {
      setBooking(undefined);
      void queryClient.invalidateQueries({ queryKey: ['repairs'] });
      void queryClient.invalidateQueries({ queryKey: ['check-defects'] });
    },
  });

  const columns: Column<DefectDto>[] = [
    {
      key: 'severity',
      header: 'How serious',
      sortValue: (d) => (d.severity === 'do_not_drive' ? 0 : 1),
      cell: (d) =>
        d.severity === 'do_not_drive' ? (
          <strong style={{ color: '#dc2626' }}>Do not drive</strong>
        ) : (
          <span style={{ color: '#b45309' }}>Fix soon</span>
        ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      sortValue: (d) => d.vehicleName,
      cell: (d) => d.vehicleName,
    },
    {
      key: 'what',
      header: 'What',
      sortValue: (d) => d.label,
      cell: (d) => (
        <div>
          <strong>{d.label}</strong>
          <div style={{ fontSize: 13 }}>{d.detail}</div>
          {d.note !== undefined && (
            <div style={{ fontSize: 13 }}>
              <em>“{d.note}”</em>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'found',
      header: 'Found',
      sortValue: (d) => d.createdAt,
      cell: (d) => whenText(d.createdAt),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (d) => d.status,
      cell: (d) => STATUS_LABELS[d.status],
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (d) =>
        canHandle || canBook ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {bookedFor.has(d.id) && (
              <span style={{ color: '#047857' }}>
                Repair booked for {bookedFor.get(d.id)?.dueDate}
              </span>
            )}
            {canBook && d.status !== 'fixed' && !bookedFor.has(d.id) && (
              <button
                type="button"
                onClick={() => {
                  setBooking(d);
                  setDueDate('');
                }}
              >
                Book repair
              </button>
            )}
            {canHandle &&
              NEXT_STEPS[d.status].map((step) => (
                <button
                  key={step.to}
                  type="button"
                  disabled={change.isPending}
                  onClick={() => change.mutate({ id: d.id, to: step.to })}
                >
                  {step.label}
                </button>
              ))}
          </span>
        ) : null,
    },
  ];

  return (
    <div>
      <h1>Defects</h1>
      <p style={{ color: '#6b7280' }}>
        What your drivers&apos; walk-round checks found. Mark each one seen when you have read it,
        and fixed when it has been dealt with.
      </p>

      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="defects-company">Company </label>
          <CompanySelect
            id="defects-company"
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            emptyLabel="Choose a company"
          />
        </div>
      )}

      {companyId === undefined ? (
        <p>Choose a company.</p>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <label>
              Show{' '}
              <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
                  <option key={f} value={f}>
                    {FILTER_LABELS[f]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {booking !== undefined && (
            <form
              style={{ border: '1px solid #e5e7eb', padding: 12, marginBottom: 16 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (dueDate !== '') book.mutate({ defectId: booking.id, dueDate });
              }}
            >
              <strong>
                Book a repair: {booking.vehicleName}, {booking.label}
              </strong>
              <label style={{ display: 'block', margin: '8px 0' }}>
                Due by{' '}
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </label>
              <p style={{ color: '#6b7280', fontSize: 13 }}>
                This marks the defect seen. The vehicle stays held back, if you hold it back for
                this, until the repair is marked done with the defect fixed.
              </p>
              {book.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(book.error)}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={dueDate === '' || book.isPending}>
                  {book.isPending ? 'Booking…' : 'Book'}
                </button>
                <button type="button" onClick={() => setBooking(undefined)}>
                  Cancel
                </button>
              </div>
            </form>
          )}
          {(defects.isError || change.isError) && (
            <p style={{ color: '#dc2626' }}>{staffErrorMessage(defects.error ?? change.error)}</p>
          )}
          {defects.isPending ? (
            <p>Loading…</p>
          ) : (
            <DataTable
              columns={columns}
              rows={defects.data ?? []}
              rowKey={(d) => d.id}
              searchText={(d) => `${d.vehicleName} ${d.label} ${d.detail} ${d.note ?? ''}`}
              emptyText={filter === 'todo' ? 'No defects waiting. Well done.' : 'None.'}
            />
          )}
        </>
      )}
    </div>
  );
}
