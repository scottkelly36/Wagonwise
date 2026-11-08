import { IMPORT_MAX_ROWS, type ImportResponse, type ImportRow } from '@wagonwise/contracts/sales';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as salesApi from '../api/sales';
import { readFirmsCsv } from '../lib/sales';
import { staffErrorMessage } from '../pages/staff/messages';
import { useStaffAuthStore } from '../state/staff-auth-store';

/**
 * Adds many firms at once from a spreadsheet saved as CSV. Nothing is added until the person has seen how many firms were
 * read. A firm already listed is skipped, so the same file can be sent twice.
 */
export function SalesImport({ onClose }: { onClose: () => void }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<ImportResponse | undefined>(undefined);

  const send = useMutation({
    mutationFn: async (): Promise<ImportResponse> => {
      let added = 0;
      const skipped: ImportResponse['skipped'] = [];
      for (let i = 0; i < rows.length; i += IMPORT_MAX_ROWS) {
        const part = await withAccessToken((t) =>
          salesApi.importProspects(t, rows.slice(i, i + IMPORT_MAX_ROWS)),
        );
        added += part.added;
        skipped.push(...part.skipped);
      }
      return { added, skipped };
    },
    onSuccess: (done) => {
      setResult(done);
      setRows([]);
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
  });

  const read = async (file: File | undefined): Promise<void> => {
    setResult(undefined);
    if (file === undefined) return;
    const parsed = readFirmsCsv(await file.text());
    setRows(parsed.rows);
    setProblem(parsed.problem);
  };

  return (
    <section className="box mb-16">
      <strong>Import firms from a spreadsheet</strong>
      <p className="text-muted text-13">
        Save the sheet as CSV. It needs a heading called Name; these are also read when present:
        Town, Fleet size, Type of haulage, Website, Phone, Email, Contact person, Legal form,
        Relationship (warm or new), Next step and Notes. A firm already on the list is skipped.
      </p>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => void read(e.target.files?.[0])}
        aria-label="Spreadsheet saved as CSV"
      />
      {problem !== undefined && <p className="text-danger">{problem}</p>}
      {rows.length > 0 && (
        <p>
          {rows.length} firm{rows.length === 1 ? '' : 's'} read.{' '}
          <button
            type="button"
            className="btn-primary"
            disabled={send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? 'Adding…' : `Add ${rows.length === 1 ? 'it' : 'them'}`}
          </button>
        </p>
      )}
      {send.isError && <p className="text-danger">{staffErrorMessage(send.error)}</p>}
      {result !== undefined && (
        <div>
          <p>
            Added {result.added}. Skipped {result.skipped.length}.
          </p>
          {result.skipped.length > 0 && (
            <ul className="text-13">
              {result.skipped.map((s, i) => (
                <li key={`${s.name}-${i}`}>
                  {s.name === '' ? '(no name)' : s.name}:{' '}
                  {s.reason === 'already_listed' ? 'already on the list' : 'could not be read'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button type="button" onClick={onClose}>
        Close
      </button>
    </section>
  );
}
