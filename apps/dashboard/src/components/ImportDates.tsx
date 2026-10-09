import type { ImportRowResultDto } from '@wagonwise/contracts/maintenance';
import { IMPORT_MAX_ROWS } from '@wagonwise/contracts/maintenance';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as maintenanceApi from '../api/maintenance';
import { readImport, type ImportRow } from '../lib/maintenance-import';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

const REASONS = {
  unknown_vehicle: 'no vehicle with that registration',
  ambiguous_vehicle: 'more than one vehicle has that registration',
  unknown_item: 'you do not track anything by that name',
  not_for_vehicle: 'that is not tracked for this vehicle',
  invalid_date: 'the date could not be read (use 31/01/2027)',
} as const;

/**
 * Sets next-due dates for many vehicles at once from a spreadsheet saved as CSV. Nothing is changed until the person
 * has seen how many dates were read; rows that cannot go in are listed so they can be fixed and sent again.
 */
export function ImportDates({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [results, setResults] = useState<ImportRowResultDto[] | undefined>(undefined);

  const send = useMutation({
    mutationFn: async () => {
      const all: ImportRowResultDto[] = [];
      for (let i = 0; i < rows.length; i += IMPORT_MAX_ROWS) {
        const part = rows.slice(i, i + IMPORT_MAX_ROWS);
        all.push(...(await withAccessToken((t) => maintenanceApi.importDates(t, companyId, part))));
      }
      return all;
    },
    onSuccess: (all) => {
      setResults(all);
      void queryClient.invalidateQueries({ queryKey: ['maintenance-overview'] });
    },
  });

  const read = async (file: File | undefined): Promise<void> => {
    setResults(undefined);
    if (file === undefined) return;
    const parsed = readImport(await file.text());
    setRows(parsed.rows);
    setProblem(parsed.problem);
  };

  const skipped = (results ?? []).flatMap((r, i) =>
    r.status === 'skipped' ? [{ row: rows[i], reason: r.reason }] : [],
  );
  const applied = (results ?? []).length - skipped.length;

  return (
    <div style={{ border: '1px solid #e5e7eb', padding: 12, marginBottom: 16 }}>
      <strong>Import dates from a spreadsheet</strong>
      <p style={{ color: '#6b7280', fontSize: 13 }}>
        Save your spreadsheet as CSV. The first row names the columns: a <em>Registration</em>{' '}
        column, then a column for each thing you track (for example <em>MOT</em>), with the next due
        date in each cell (like 31/01/2027). Empty cells are left alone. Vehicles are matched by
        registration, so add those on the Vehicle profiles page first.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => void read(e.target.files?.[0])} />
      {problem !== undefined && <p style={{ color: '#b45309' }}>{problem}</p>}
      {problem === undefined && rows.length > 0 && results === undefined && (
        <p>
          {rows.length} date{rows.length === 1 ? '' : 's'} read.{' '}
          <button type="button" disabled={send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Importing…' : 'Import them'}
          </button>
        </p>
      )}
      {send.isError && <p style={{ color: '#dc2626' }}>{staffErrorMessage(send.error)}</p>}
      {results !== undefined && (
        <div>
          <p>
            <strong>{applied}</strong> date{applied === 1 ? '' : 's'} set
            {skipped.length > 0 && `, ${skipped.length} not set:`}
          </p>
          {skipped.length > 0 && (
            <ul>
              {skipped.map((s, i) => (
                <li key={i}>
                  {s.row?.registration || '(no registration)'}, {s.row?.itemName}, {s.row?.dueDate}:{' '}
                  {REASONS[s.reason]}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
