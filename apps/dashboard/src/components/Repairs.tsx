import { ErrorNotice } from './ErrorNotice';
import { Loading } from './Loading';
import { useConfirm, useNotify } from './feedback-context';
import type { RepairDto } from '@wagonwise/contracts/maintenance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as maintenanceApi from '../api/maintenance';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { staffErrorMessage } from '../pages/staff/messages';
import { DataTable, type Column } from './DataTable';

const dueWords = (r: RepairDto): string => {
  if (r.status === 'done') return `Done ${r.doneOn ?? ''}`.trim();
  if (r.status === 'cancelled') return 'Cancelled';
  if (r.overdue) return `${-r.daysLeft} day${r.daysLeft === -1 ? '' : 's'} late (${r.dueDate})`;
  if (r.daysLeft === 0) return `Today (${r.dueDate})`;
  return `${r.dueDate} (${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'})`;
};

/**
 * The repairs booked for defects drivers found. Whoever has `manage_maintenance` finishes them (which can mark the defect
 * fixed and so release a vehicle held back for it) or cancels one booked in error.
 */
export function Repairs({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'open' | 'done'>('open');
  const [finishing, setFinishing] = useState<RepairDto | undefined>(undefined);
  const [note, setNote] = useState('');
  const [markFixed, setMarkFixed] = useState(true);

  const repairs = useQuery({
    queryKey: ['repairs', companyId, filter],
    queryFn: () => withAccessToken((token) => maintenanceApi.listRepairs(token, companyId, filter)),
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['repairs'] });
    void queryClient.invalidateQueries({ queryKey: ['check-defects'] });
  };
  const notify = useNotify();
  const finish = useMutation({
    mutationFn: (r: RepairDto) =>
      withAccessToken((token) =>
        maintenanceApi.completeRepair(token, r.id, {
          markDefectFixed: markFixed,
          ...(note.trim() === '' ? {} : { note: note.trim() }),
        }),
      ),
    onSuccess: () => {
      notify('Repair marked done');
      setFinishing(undefined);
      setNote('');
      setMarkFixed(true);
      refresh();
    },
  });
  const ask = useConfirm();
  const cancel = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => maintenanceApi.cancelRepair(token, id)),
    onSuccess: refresh,
  });

  const columns: Column<RepairDto>[] = [
    {
      key: 'due',
      header: 'Due',
      sortValue: (r) => r.dueDate,
      cell: (r) => (
        <span style={r.overdue ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
          {dueWords(r)}
        </span>
      ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      sortValue: (r) => r.vehicleName,
      cell: (r) => r.vehicleName,
    },
    {
      key: 'what',
      header: 'What',
      sortValue: (r) => r.title,
      cell: (r) => (
        <div>
          {r.severity === 'do_not_drive' && <strong className="text-danger">Do not drive </strong>}
          {r.title}
          {r.note !== undefined && (
            <div className="text-13">
              <em>“{r.note}”</em>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'act',
      header: '',
      align: 'right',
      cell: (r) =>
        canManage && r.status === 'open' ? (
          <span className="inline-flex gap-6">
            <button className="btn-confirm" type="button" onClick={() => setFinishing(r)}>
              Mark done
            </button>
            <button
              className="btn-caution"
              type="button"
              disabled={cancel.isPending}
              onClick={() => {
                void ask({
                  message: 'Cancel this repair? The defect is left as it is.',
                  confirmLabel: 'Cancel repair',
                  cancelLabel: 'Keep repair',
                  tone: 'caution',
                }).then((ok) => {
                  if (ok) cancel.mutate(r.id, { onSuccess: () => notify('Repair cancelled') });
                });
              }}
            >
              Cancel
            </button>
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <p className="text-muted">
        Repairs booked for defects your drivers found. Book one from the Defects page.
      </p>
      <label className="block mb-12">
        Show{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'done')}>
          <option value="open">Still to do</option>
          <option value="done">Done</option>
        </select>
      </label>
      {finishing !== undefined && (
        <form
          style={{ border: '1px solid var(--border)', padding: 12, marginBottom: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            finish.mutate(finishing);
          }}
        >
          <strong>
            Done: {finishing.vehicleName}, {finishing.title}
          </strong>
          <label className="block mt-8">
            Note (optional){' '}
            <input
              value={note}
              maxLength={500}
              placeholder="For example: new tyre fitted"
              onChange={(e) => setNote(e.target.value)}
              style={{ width: '100%', maxWidth: 360 }}
            />
          </label>
          <label className="block my-8">
            <input
              type="checkbox"
              checked={markFixed}
              onChange={(e) => setMarkFixed(e.target.checked)}
            />{' '}
            Mark the defect fixed too (this lets the vehicle go out again)
          </label>
          {finish.isError && <p className="text-danger">{staffErrorMessage(finish.error)}</p>}
          <div className="flex gap-8">
            <button type="submit" disabled={finish.isPending}>
              {finish.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setFinishing(undefined)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {(repairs.isError || cancel.isError) && <ErrorNotice error={repairs.error ?? cancel.error} />}
      {repairs.isPending ? (
        <Loading />
      ) : (
        <DataTable
          columns={columns}
          rows={repairs.data ?? []}
          rowKey={(r) => r.id}
          searchText={(r) => `${r.vehicleName} ${r.title} ${r.note ?? ''}`}
          emptyText={filter === 'open' ? 'No repairs waiting.' : 'None yet.'}
        />
      )}
    </>
  );
}
