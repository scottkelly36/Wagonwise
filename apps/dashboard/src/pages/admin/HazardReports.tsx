import type { HazardReportDto } from '@wagonwise/contracts/hazards';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as hazardsApi from '../../api/hazards';
import { DataTable, IconButton, type Column } from '../../components/DataTable';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const HAZARDS_KEY = ['hazards'] as const;

/** Replaces the driver app's own admin-only delete UI (2026-09-27) — that had no way to browse
 *  hazards at all, only ever reachable one at a time from a map marker a driver happened to be
 *  looking at. This is the first real place to see every report and clean up test data. */
export function HazardReports() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const hazards = useQuery({
    queryKey: HAZARDS_KEY,
    queryFn: () => withAccessToken((token) => hazardsApi.listHazards(token)),
  });

  const deleteHazard = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => hazardsApi.deleteHazard(token, id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: HAZARDS_KEY }),
  });

  const error = hazards.error ?? deleteHazard.error;

  const columns: Column<HazardReportDto>[] = [
    {
      key: 'type',
      header: 'Type',
      sortValue: (h) => h.type,
      cell: (h) => h.type.replaceAll('_', ' '),
    },
    { key: 'status', header: 'Status', sortValue: (h) => h.status, cell: (h) => h.status },
    {
      key: 'from',
      header: 'From',
      sortValue: (h) => h.source,
      cell: (h) => (h.source === 'osm' ? 'OpenStreetMap' : 'Driver'),
    },
    {
      key: 'confirmations',
      header: 'Confirmations',
      sortValue: (h) => h.confirmations,
      cell: (h) => h.confirmations,
    },
    {
      key: 'dismissals',
      header: 'Dismissals',
      sortValue: (h) => h.dismissals,
      cell: (h) => h.dismissals,
    },
    {
      key: 'reported',
      header: 'Reported',
      sortValue: (h) => h.createdAt,
      cell: (h) => new Date(h.createdAt).toLocaleDateString('en-GB'),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (h) => (
        <IconButton
          icon="delete"
          danger
          label="Delete this hazard report"
          disabled={deleteHazard.isPending && deleteHazard.variables === h.id}
          onClick={() => {
            if (confirm('Delete this hazard report? This cannot be undone.')) {
              deleteHazard.mutate(h.id);
            }
          }}
        />
      ),
    },
  ];

  return (
    <div>
      <h1>Hazard reports</h1>

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      {hazards.isPending ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={hazards.data ?? []}
          rowKey={(hazard) => hazard.id}
          searchText={(hazard) =>
            `${hazard.type.replaceAll('_', ' ')} ${hazard.status} ${hazard.note ?? ''} ${hazard.source === 'osm' ? 'openstreetmap' : 'driver'}`
          }
          emptyText="No hazard reports."
        />
      )}
      <p className="muted" style={{ marginTop: 16, fontSize: 13 }}>
        Hazards marked OpenStreetMap are low bridges and weight-limited bridges from OpenStreetMap,
        © OpenStreetMap contributors, available under the{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          Open Database Licence
        </a>
        . Drivers can confirm or dismiss them like any hazard, and you can delete one here.
      </p>
    </div>
  );
}
