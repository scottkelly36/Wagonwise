import type { ReportedPlaceDto } from '@wagonwise/contracts/places';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as placesApi from '../../api/places';
import { DataTable, type Column } from '../../components/DataTable';
import { placeMapLink, reasonsText, reportedPlaceSearchText } from '../../lib/reported-places';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const REPORTED_KEY = ['reported-places'] as const;

/**
 * Places drivers made public that other drivers have reported (wrong spot, someone's home or private land, an offensive note).
 * Three different drivers hide a place from everyone but its owner until it is looked at here. Keep it (the reports are cleared
 * and it shows again) or make it private (it goes back to its owner, who keeps it). Neither deletes what a driver marked, and
 * neither shows who marked it or who reported it. WagonWise staff only.
 */
export function ReportedPlaces() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const reported = useQuery({
    queryKey: REPORTED_KEY,
    queryFn: () => withAccessToken((token) => placesApi.listReportedPlaces(token)),
  });
  const decide = useMutation({
    mutationFn: (input: { id: string; decision: 'keep' | 'make_private' }) =>
      withAccessToken((token) => placesApi.moderatePlace(token, input.id, input.decision)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: REPORTED_KEY }),
  });

  const columns: Column<ReportedPlaceDto>[] = [
    {
      key: 'place',
      header: 'Place',
      sortValue: (r) => r.place.name.toLowerCase(),
      cell: (r) => (
        <div>
          <strong>{r.place.name}</strong> <span className="muted">({r.place.category})</span>
          {r.place.note !== undefined && (
            <div style={{ whiteSpace: 'pre-wrap' }}>{r.place.note}</div>
          )}
          <a href={placeMapLink(r.place.location)} target="_blank" rel="noreferrer">
            Look at it on the map
          </a>
        </div>
      ),
    },
    {
      key: 'reports',
      header: 'Reports',
      sortValue: (r) => r.reportCount,
      cell: (r) => (
        <div>
          <strong>{r.reportCount}</strong>{' '}
          {r.hidden ? (
            <span style={{ color: 'var(--danger)' }}>hidden from other drivers</span>
          ) : (
            <span className="muted">still shown</span>
          )}
          <div className="muted" style={{ fontSize: 12 }}>
            {reasonsText(r.reasons)}
          </div>
        </div>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      cell: (r) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn-secondary"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ id: r.place.id, decision: 'keep' })}
          >
            Keep it public
          </button>
          <button
            className="btn-primary"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ id: r.place.id, decision: 'make_private' })}
          >
            Make private
          </button>
        </div>
      ),
    },
  ];

  const error = reported.error ?? decide.error;

  return (
    <div>
      <h1>Reported places</h1>
      <p className="muted">
        Places drivers shared with everyone that other drivers have reported. Three different
        drivers hide a place from the others until you decide here. Making one private gives it back
        to its owner; nothing a driver marked is deleted.
      </p>

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      {reported.data === undefined ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={reported.data}
          rowKey={(r) => r.place.id}
          searchText={reportedPlaceSearchText}
          emptyText="No reported places. Nothing needs a decision."
        />
      )}
    </div>
  );
}
