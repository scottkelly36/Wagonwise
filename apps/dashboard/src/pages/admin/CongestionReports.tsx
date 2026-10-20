import type { StaffCongestionReportDto } from '@wagonwise/contracts/congestion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as congestionApi from '../../api/congestion';
import { DataTable, IconButton, type Column } from '../../components/DataTable';
import { mapLink, timeLeftText, waitText } from '../../lib/congestion';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const CONGESTION_KEY = ['congestion-reports'] as const;

/**
 * The traffic reports drivers have made (a queue, with how long they said it would last). A report stops showing to drivers once its
 * time runs out; this page lets WagonWise staff see them all, remove a wrong or test report, and clear the ones that have expired.
 * WagonWise staff only.
 */
export function CongestionReports() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const reports = useQuery({
    queryKey: CONGESTION_KEY,
    queryFn: () => withAccessToken((token) => congestionApi.listCongestionReports(token)),
  });
  const refresh = (): void => void queryClient.invalidateQueries({ queryKey: CONGESTION_KEY });
  const remove = useMutation({
    mutationFn: (id: string) =>
      withAccessToken((token) => congestionApi.deleteCongestionReport(token, id)),
    onSuccess: refresh,
  });
  const clear = useMutation({
    mutationFn: () =>
      withAccessToken((token) => congestionApi.clearExpiredCongestionReports(token)),
    onSuccess: refresh,
  });

  const now = new Date();
  const columns: Column<StaffCongestionReportDto>[] = [
    {
      key: 'reported',
      header: 'Reported',
      sortValue: (r) => r.createdAt,
      cell: (r) => new Date(r.createdAt).toLocaleString('en-GB'),
    },
    {
      key: 'wait',
      header: 'Wait said',
      align: 'right',
      sortValue: (r) => r.estimatedWaitMinutes,
      cell: (r) => waitText(r.estimatedWaitMinutes),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (r) => (r.active ? 0 : 1),
      cell: (r) => timeLeftText(r, now),
    },
    {
      key: 'place',
      header: 'Place',
      cell: (r) => (
        <a href={mapLink(r)} target="_blank" rel="noreferrer">
          {r.location.lat.toFixed(4)}, {r.location.lon.toFixed(4)}
        </a>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (r) => (
        <IconButton
          icon="delete"
          danger
          label="Delete this congestion report"
          disabled={remove.isPending && remove.variables === r.id}
          onClick={() => {
            if (confirm('Delete this congestion report? This cannot be undone.')) {
              remove.mutate(r.id);
            }
          }}
        />
      ),
    },
  ];

  const error = reports.error ?? remove.error ?? clear.error;
  const data = reports.data;
  const expired = data === undefined ? 0 : data.total - data.active;

  return (
    <div>
      <h1>Congestion reports</h1>
      <p className="muted">
        Traffic queues drivers have reported, each with how long they said it would last. A report
        stops showing to drivers when that time runs out; it stays here until you clear it.
      </p>

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      {data === undefined ? (
        <p>Loading…</p>
      ) : (
        <>
          <p>
            <strong>{data.active}</strong> active, <strong>{expired}</strong> expired.{' '}
            <button
              className="btn-secondary"
              disabled={expired === 0 || clear.isPending}
              onClick={() => {
                if (confirm(`Remove the ${expired} expired report${expired === 1 ? '' : 's'}?`)) {
                  clear.mutate();
                }
              }}
            >
              {clear.isPending ? 'Clearing…' : 'Clear expired reports'}
            </button>
          </p>
          {data.total > data.reports.length && (
            <p className="muted">
              Showing the newest {data.reports.length} of {data.total}.
            </p>
          )}
          <DataTable
            columns={columns}
            rows={data.reports}
            rowKey={(r) => r.id}
            emptyText="No congestion reports."
          />
        </>
      )}
    </div>
  );
}
