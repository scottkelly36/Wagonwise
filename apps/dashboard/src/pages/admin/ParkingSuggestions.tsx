import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as parkingApi from '../../api/parking';
import { suggestedChanges } from '../../lib/parking';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const SUGGESTIONS_KEY = ['parking-suggestions'] as const;

/**
 * Changes drivers have suggested to parking spots (a better name, how many lorries it takes, facilities, a note, or that
 * the place is closed or gone). Nothing changes on the map until a suggestion is approved here. Who suggested it is not
 * shown: the change is judged, not the person. Shows nothing at all when none are waiting.
 */
export function ParkingSuggestions({ onDecided }: { onDecided: () => void }) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const suggestions = useQuery({
    queryKey: SUGGESTIONS_KEY,
    queryFn: () => withAccessToken((token) => parkingApi.listSpotSuggestions(token)),
  });
  const decide = useMutation({
    mutationFn: (input: { id: string; decision: 'approve' | 'reject' }) =>
      withAccessToken((token) => parkingApi.decideSpotSuggestion(token, input.id, input.decision)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SUGGESTIONS_KEY });
      onDecided();
    },
  });

  const waiting = suggestions.data?.suggestions ?? [];
  const error = suggestions.error ?? decide.error;
  if (waiting.length === 0 && error === null) return null;

  return (
    <section className="card" style={{ marginBottom: 16 }}>
      <h2 style={{ marginTop: 0 }}>Suggested changes ({waiting.length})</h2>
      <p className="muted">
        Drivers suggested these. Nothing changes on the map until you approve it.
      </p>
      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}
      {waiting.map((s) => (
        <div
          key={s.id}
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 0',
            display: 'grid',
            gap: 6,
          }}
        >
          <strong>{s.spot.name ?? s.spot.note ?? 'Unnamed place'}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {s.spot.location.lat.toFixed(5)}, {s.spot.location.lon.toFixed(5)} · suggested{' '}
            {new Date(s.suggestedAt).toLocaleDateString('en-GB')}
          </span>
          {s.gone ? (
            <span style={{ color: 'var(--danger)' }}>
              Says this place is closed or gone. Approving deletes it from the map.
            </span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {suggestedChanges(s.spot, s.changes).map((c) => (
                <li key={c.label}>
                  {c.label}: <span className="muted">{c.from}</span> → <strong>{c.to}</strong>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: s.id, decision: 'approve' })}
            >
              {s.gone ? 'Approve and delete the place' : 'Approve'}
            </button>
            <button
              className="btn-secondary"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ id: s.id, decision: 'reject' })}
            >
              Turn down
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
