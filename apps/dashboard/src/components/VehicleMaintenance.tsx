import type { OverviewRowDto } from '@wagonwise/contracts/maintenance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as maintenanceApi from '../api/maintenance';
import { dayText, dueText, STATUS_COLOURS, STATUS_LABELS, vehicleLabel } from '../lib/maintenance';
import { ukToday } from '../lib/money';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

type Action = { itemId: string; kind: 'set' | 'done' } | undefined;

/**
 * One vehicle's maintenance: each item the company tracks, when it is next due, and what has been done. Whoever has
 * `manage_maintenance` can enter a date or mark an item done, which records it and moves the next date on. Anyone
 * who can see the page can read it.
 */
export function VehicleMaintenance({
  vehicleId,
  canManage,
  onClose,
}: {
  vehicleId: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const key = ['vehicle-maintenance', vehicleId] as const;
  const [action, setAction] = useState<Action>(undefined);

  const data = useQuery({
    queryKey: key,
    queryFn: () =>
      withAccessToken((token) => maintenanceApi.getVehicleMaintenance(token, vehicleId)),
  });
  const refresh = () => {
    setAction(undefined);
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ['maintenance-overview'] });
  };

  const rows = data.data?.rows ?? [];
  const name = rows[0] === undefined ? undefined : vehicleLabel(rows[0]);

  return (
    <section style={{ marginTop: 24, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <h2 style={{ marginTop: 0 }}>Maintenance{name === undefined ? '' : `: ${name}`}</h2>
      {data.isPending && <p>Loading…</p>}
      {data.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(data.error)}</p>}
      {data.data !== undefined && rows.length === 0 && (
        <p>
          Nothing is tracked for this vehicle yet. Add what you keep track of (MOT, inspections...)
          on the Maintenance page.
        </p>
      )}
      {rows.map((row) => (
        <ItemRow
          key={row.itemId}
          row={row}
          vehicleId={vehicleId}
          canManage={canManage}
          action={action?.itemId === row.itemId ? action.kind : undefined}
          onAction={(kind) =>
            setAction(kind === undefined ? undefined : { itemId: row.itemId, kind })
          }
          onDone={refresh}
        />
      ))}

      {data.data !== undefined && data.data.history.length > 0 && (
        <>
          <h3>What has been done</h3>
          <ul style={{ paddingLeft: 18 }}>
            {data.data.history.map((h) => (
              <li key={h.id}>
                <strong>{h.itemName}</strong>, {dayText(h.doneOn)}. Next due {dayText(h.nextDue)}.
                {h.note !== undefined && <em> “{h.note}”</em>}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" onClick={onClose} style={{ marginTop: 12 }}>
        Close
      </button>
    </section>
  );
}

function ItemRow({
  row,
  vehicleId,
  canManage,
  action,
  onAction,
  onDone,
}: {
  row: OverviewRowDto;
  vehicleId: string;
  canManage: boolean;
  action: 'set' | 'done' | undefined;
  onAction: (kind: 'set' | 'done' | undefined) => void;
  onDone: () => void;
}) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <strong>{row.itemName}</strong>
          <div>
            <span style={{ color: STATUS_COLOURS[row.status], fontWeight: 700 }}>
              {STATUS_LABELS[row.status]}
            </span>{' '}
            · {dueText(row)}
            {row.lastDone !== undefined && (
              <span style={{ color: '#6b7280' }}> · last done {dayText(row.lastDone)}</span>
            )}
          </div>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <button type="button" onClick={() => onAction(action === 'done' ? undefined : 'done')}>
              Mark done
            </button>
            <button type="button" onClick={() => onAction(action === 'set' ? undefined : 'set')}>
              {row.dueDate === undefined ? 'Enter due date' : 'Change due date'}
            </button>
          </div>
        )}
      </div>
      {action === 'set' && (
        <SetDue vehicleId={vehicleId} itemId={row.itemId} current={row.dueDate} onDone={onDone} />
      )}
      {action === 'done' && <MarkDone vehicleId={vehicleId} itemId={row.itemId} onDone={onDone} />}
    </div>
  );
}

function SetDue({
  vehicleId,
  itemId,
  current,
  onDone,
}: {
  vehicleId: string;
  itemId: string;
  current: string | undefined;
  onDone: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [date, setDate] = useState(current ?? '');
  const save = useMutation({
    mutationFn: () =>
      withAccessToken((token) => maintenanceApi.setDueDate(token, vehicleId, itemId, date)),
    onSuccess: onDone,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (date !== '') save.mutate();
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}
    >
      <label>
        <span style={{ display: 'block' }}>Next due</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button type="submit" disabled={date === '' || save.isPending}>
        {save.isPending ? 'Saving…' : 'Save date'}
      </button>
      {save.isError && <span style={{ color: '#dc2626' }}>{staffErrorMessage(save.error)}</span>}
    </form>
  );
}

function MarkDone({
  vehicleId,
  itemId,
  onDone,
}: {
  vehicleId: string;
  itemId: string;
  onDone: () => void;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const [doneOn, setDoneOn] = useState(ukToday());
  const [nextDue, setNextDue] = useState('');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        maintenanceApi.markDone(token, vehicleId, itemId, {
          doneOn,
          ...(nextDue === '' ? {} : { nextDue }),
          ...(note.trim() === '' ? {} : { note }),
        }),
      ),
    onSuccess: onDone,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      style={{ marginTop: 8 }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label>
          <span style={{ display: 'block' }}>Done on</span>
          <input
            type="date"
            value={doneOn}
            max={ukToday()}
            onChange={(e) => setDoneOn(e.target.value)}
          />
        </label>
        <label>
          <span style={{ display: 'block' }}>Next due (optional)</span>
          <input type="date" value={nextDue} onChange={(e) => setNextDue(e.target.value)} />
        </label>
        <label>
          <span style={{ display: 'block' }}>Note (optional)</span>
          <input
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: 240 }}
          />
        </label>
        <button type="submit" disabled={doneOn === '' || save.isPending}>
          {save.isPending ? 'Saving…' : 'Record it'}
        </button>
      </div>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Leave the next date blank to use the usual interval after the day it was done.
      </p>
      {save.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(save.error)}</p>}
    </form>
  );
}
