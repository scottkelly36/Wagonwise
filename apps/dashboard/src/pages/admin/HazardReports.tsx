import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as hazardsApi from '../../api/hazards';
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

  return (
    <div>
      <h1>Hazard reports</h1>

      {error !== null && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}

      {hazards.isPending ? (
        <p>Loading…</p>
      ) : hazards.data?.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No hazard reports.</p>
      ) : (
        <table style={{ width: '100%', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Status</th>
              <th>Confirmations</th>
              <th>Dismissals</th>
              <th>Reported</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {hazards.data?.map((hazard) => {
              const deleting = deleteHazard.isPending && deleteHazard.variables === hazard.id;
              return (
                <tr key={hazard.id}>
                  <td>{hazard.type}</td>
                  <td>{hazard.status}</td>
                  <td>{hazard.confirmations}</td>
                  <td>{hazard.dismissals}</td>
                  <td>{new Date(hazard.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => {
                        if (confirm('Delete this hazard report? This cannot be undone.')) {
                          deleteHazard.mutate(hazard.id);
                        }
                      }}
                      disabled={deleting}
                    >
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
