import type { TesterDto } from '@wagonwise/contracts/signups';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as signupsApi from '../../api/signups';
import { DataTable, type Column } from '../../components/DataTable';
import { roleLabel, testersCsv } from '../../lib/testers';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const TESTERS_KEY = ['testers'] as const;

function download(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Who has put their email on the landing page to test the app. WagonWise staff only. */
export function Testers() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const testers = useQuery({
    queryKey: TESTERS_KEY,
    queryFn: () => withAccessToken((token) => signupsApi.listTesters(token)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => signupsApi.deleteTester(token, id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: TESTERS_KEY }),
  });

  const columns: Column<TesterDto>[] = [
    { key: 'email', header: 'Email', sortValue: (t) => t.email, cell: (t) => t.email },
    { key: 'name', header: 'Name', sortValue: (t) => t.name ?? '', cell: (t) => t.name ?? '' },
    { key: 'role', header: 'Is a', sortValue: (t) => t.role, cell: (t) => roleLabel(t.role) },
    {
      key: 'company',
      header: 'Company',
      sortValue: (t) => t.company ?? '',
      cell: (t) => (t.company ?? '') + (t.fleetSize === undefined ? '' : ` (${t.fleetSize})`),
    },
    {
      key: 'at',
      header: 'Signed up',
      sortValue: (t) => t.createdAt,
      cell: (t) => new Date(t.createdAt).toLocaleDateString('en-GB'),
    },
    {
      key: 'remove',
      header: '',
      align: 'right',
      cell: (t) => (
        <button
          className="btn-danger"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Remove ${t.email} from the list?`)) remove.mutate(t.id);
          }}
        >
          Remove
        </button>
      ),
    },
  ];

  const error = testers.error ?? remove.error;
  const data = testers.data;

  return (
    <div>
      <h1>Testers</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        People who asked, on the landing page, to hear when testing opens. Each ticked the box
        agreeing to be emailed about it; they can also remove themselves from the page.
      </p>

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      {data === undefined ? (
        <p>Loading…</p>
      ) : (
        <>
          <p>
            <strong>{data.total}</strong> {data.total === 1 ? 'person' : 'people'} signed up.{' '}
            <button
              className="btn-secondary"
              disabled={data.testers.length === 0}
              onClick={() => download('wagonwise-testers.csv', testersCsv(data.testers))}
            >
              Download as a spreadsheet
            </button>
          </p>
          <DataTable
            columns={columns}
            rows={data.testers}
            rowKey={(t) => t.id}
            searchText={(t) => `${t.email} ${t.name ?? ''} ${t.company ?? ''}`}
            emptyText="Nobody has signed up yet."
          />
        </>
      )}
    </div>
  );
}
