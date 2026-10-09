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
  const finish = useMutation({
    mutationFn: (r: RepairDto) =>
      withAccessToken((token) =>
        maintenanceApi.completeRepair(token, r.id, {
          markDefectFixed: markFixed,
          ...(note.trim() === '' ? {} : { note: note.trim() }),
        }),
      ),
    onSuccess: () => {
      setFinishing(undefined);
      setNote('');
      setMarkFixed(true);
      refresh();
    },
  });
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
        <span style={r.overdue ? { color: '#dc2626', fontWeight: 600 } : undefined}>
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
          {r.severity === 'do_not_drive' && (
            <strong style={{ color: '#dc2626' }}>Do not drive </strong>
          )}
          {r.title}
          {r.note !== undefined && (
            <div style={{ fontSize: 13 }}>
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
          <span style={{ display: 'inline-flex', gap: 6 }}>
            <button type="button" onClick={() => setFinishing(r)}>
              Mark done
            </button>
            <button
              type="button"
              disabled={cancel.isPending}
              onClick={() => {
                if (window.confirm('Cancel this repair? The defect is left as it is.')) {
                  cancel.mutate(r.id);
                }
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
      <p style={{ color: '#6b7280' }}>
        Repairs booked for defects your drivers found. Book one from the Defects page.
      </p>
      <label style={{ display: 'block', marginBottom: 12 }}>
        Show{' '}
        <select value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'done')}>
          <option value="open">Still to do</option>
          <option value="done">Done</option>
        </select>
      </label>
      {finishing !== undefined && (
        <form
          style={{ border: '1px solid #e5e7eb', padding: 12, marginBottom: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            finish.mutate(finishing);
          }}
        >
          <strong>
            Done: {finishing.vehicleName}, {finishing.title}
          </strong>
          <label style={{ display: 'block', marginTop: 8 }}>
            Note (optional){' '}
            <input
              value={note}
              maxLength={500}
              placeholder="For example: new tyre fitted"
              onChange={(e) => setNote(e.target.value)}
              style={{ width: '100%', maxWidth: 360 }}
            />
          </label>
          <label style={{ display: 'block', margin: '8px 0' }}>
            <input
              type="checkbox"
              checked={markFixed}
              onChange={(e) => setMarkFixed(e.target.checked)}
            />{' '}
            Mark the defect fixed too (this lets the vehicle go out again)
          </label>
          {finish.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(finish.error)}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={finish.isPending}>
              {finish.isPending ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setFinishing(undefined)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {(repairs.isError || cancel.isError) && (
        <p style={{ color: '#dc2626' }}>{staffErrorMessage(repairs.error ?? cancel.error)}</p>
      )}
      {repairs.isPending ? (
        <p>Loading…</p>
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
