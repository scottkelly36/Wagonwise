import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as sosApi from '../api/sos';
import { contactHref, sinceText, sosMapLink, vehicleText, whereText } from '../lib/sos';
import { holds } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { staffErrorMessage } from '../pages/staff/messages';

const SOS_KEY = ['sos-open'] as const;
const REFRESH_MS = 15_000;

/**
 * Open SOS alerts from the company's drivers, as a red strip above every page, checked every 15 seconds while the portal is
 * open. Each says who, where (the three words, the nearest town and a map link), how to ring them, and which lorry and job.
 * WagonWise does not call the emergency services, and the strip says so. Someone who can dispatch marks an alert dealt with, and it
 * goes. Shown only to a company's own staff: WagonWise staff have no company here.
 */
export function SosBanner() {
  const staff = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();
  const isFleet = staff?.kind === 'fleet';
  const alerts = useQuery({
    queryKey: SOS_KEY,
    queryFn: () => withAccessToken((token) => sosApi.listSos(token, 'open')),
    refetchInterval: REFRESH_MS,
    enabled: isFleet,
    retry: false,
  });
  const resolve = useMutation({
    mutationFn: (id: string) => withAccessToken((token) => sosApi.resolveSos(token, id)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: SOS_KEY }),
  });

  const open = alerts.data ?? [];
  if (!isFleet || open.length === 0) return null;
  const canResolve = holds(staff, 'dispatch');
  const now = new Date();

  return (
    <section
      role="alert"
      aria-label="SOS alerts"
      style={{
        border: '2px solid var(--danger)',
        borderRadius: 8,
        background: 'var(--danger-soft, rgba(220, 38, 38, 0.1))',
        padding: 12,
        marginBottom: 16,
        display: 'grid',
        gap: 12,
      }}
    >
      <strong style={{ color: 'var(--danger)', fontSize: 18 }}>
        {open.length === 1 ? 'SOS from a driver' : `${open.length} SOS alerts from drivers`}
      </strong>
      <span className="muted">
        WagonWise has not contacted the emergency services. Ring the driver; if they cannot answer
        or need help, call 999 and give them the three words.
      </span>
      {resolve.error !== null && (
        <span style={{ color: 'var(--danger)' }}>{staffErrorMessage(resolve.error)}</span>
      )}
      {open.map((a) => {
        const href = a.driverContact === undefined ? undefined : contactHref(a.driverContact);
        const vehicle = vehicleText(a);
        return (
          <div
            key={a.id}
            style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'grid', gap: 4 }}
          >
            <strong>
              {a.driverName ?? 'A driver'} · {sinceText(a.createdAt, now)}
            </strong>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{whereText(a)}</span>
            <a href={sosMapLink(a.location)} target="_blank" rel="noreferrer">
              Look at it on the map
            </a>
            {a.driverContact !== undefined && (
              <span>
                Ring them:{' '}
                {href === undefined ? a.driverContact : <a href={href}>{a.driverContact}</a>}
              </span>
            )}
            {vehicle !== undefined && <span>Vehicle: {vehicle}</span>}
            {a.jobReference !== undefined && <span>Job: {a.jobReference}</span>}
            {canResolve && (
              <div>
                <button
                  className="btn-primary"
                  disabled={resolve.isPending}
                  onClick={() => resolve.mutate(a.id)}
                >
                  Dealt with
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
