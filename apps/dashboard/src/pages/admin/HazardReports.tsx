import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as hazardsApi from '../../api/hazards';
import { ApiError } from '../../api/errors';
import { useAuthStore } from '../../state/auth-store';

const HAZARDS_KEY = ['hazards'] as const;

/** Replaces the driver app's own admin-only delete UI (2026-09-27) — that had no way to browse
 *  hazards at all, only ever reachable one at a time from a map marker a driver happened to be
 *  looking at. This is the first real place to see every report and clean up test data. */
export function HazardReports() {
  const accessToken = useAuthStore((s) =>
    s.state.status === 'signedIn' ? s.state.accessToken : undefined,
  );
  const queryClient = useQueryClient();

  const hazards = useQuery({
    queryKey: HAZARDS_KEY,
    queryFn: () => hazardsApi.listHazards(accessToken as string),
    enabled: accessToken !== undefined,
  });

  const deleteHazard = useMutation({
    mutationFn: (id: string) => hazardsApi.deleteHazard(accessToken as string, id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: HAZARDS_KEY }),
  });

  const error = hazards.error ?? deleteHazard.error;

  return (
    <div>
      <h1>Hazard reports</h1>

      {error !== null && (
        <p style={{ color: '#dc2626' }}>
          {error instanceof ApiError ? error.tag : 'Something went wrong.'}
        </p>
      )}

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
