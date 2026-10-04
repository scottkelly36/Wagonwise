import type { JobDto } from '@wagonwise/contracts/jobs';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import * as companiesApi from '../../api/companies';
import * as fleetApi from '../../api/fleet';
import * as jobsApi from '../../api/jobs';
import { decodePolyline6 } from '../../lib/polyline';
import { FleetMap, type MapMarker } from '../../components/FleetMap';
import {
  etaText,
  formatMiles,
  isOnTheRoad,
  lastSeen,
  nextStop,
  straightLineMetres,
  type Freshness,
} from '../../lib/live-map';
import { holds, isPlatform } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const POLL_MS = 10_000;
const COLOURS: Record<Freshness, string> = { live: '#16a34a', stale: '#d97706', lost: '#6b7280' };

const STATUS_LABELS: Record<JobDto['status'], string> = {
  draft: 'Not assigned',
  assigned: 'Assigned',
  accepted: 'Accepted — heading to pickup',
  at_pickup: 'At pickup',
  loaded: 'Loaded',
  en_route: 'En route',
  at_delivery: 'At delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  failed: 'Failed',
};

/** The dispatcher's live map (P2-M6.2, design doc §6): every vehicle on a job that's on the road,
 *  where it was last heard from, and which stop it's heading for. Refreshed by polling every few
 *  seconds rather than the design doc's server-sent events — a browser's `EventSource` can't send
 *  the `Authorization` header this API needs, and drivers only report every 30 seconds, so a push
 *  stream wouldn't show anything fresher. A phone only reports while its app is open
 *  (foreground-only, M6.1), so "last seen" matters as much as the dot. */
export function LiveTrips() {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const everyCompany = isPlatform(me);
  const canSeeNames = holds(me, 'dispatch');

  const companies = useQuery({
    queryKey: ['companies'],
    queryFn: () => withAccessToken((token) => companiesApi.listCompanies(token)),
    enabled: everyCompany,
  });
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(undefined);
  const companyId = everyCompany ? selectedCompanyId : me?.companyId;

  const jobs = useQuery({
    queryKey: ['jobs', companyId],
    queryFn: () => withAccessToken((token) => jobsApi.listJobs(token, companyId as string)),
    enabled: companyId !== undefined,
    refetchInterval: POLL_MS,
  });
  const positions = useQuery({
    queryKey: ['job-positions', companyId],
    queryFn: () => withAccessToken((token) => jobsApi.listJobPositions(token, companyId as string)),
    enabled: companyId !== undefined,
    refetchInterval: POLL_MS,
  });
  const etas = useQuery({
    queryKey: ['job-etas', companyId],
    queryFn: () => withAccessToken((token) => jobsApi.listJobEtas(token, companyId as string)),
    enabled: companyId !== undefined,
    refetchInterval: POLL_MS,
  });
  const drivers = useQuery({
    queryKey: ['driver-links', companyId],
    queryFn: () => withAccessToken((token) => fleetApi.listDriverLinks(token, companyId as string)),
    enabled: canSeeNames && companyId !== undefined,
  });
  const vehicles = useQuery({
    queryKey: ['fleet-vehicles', companyId],
    queryFn: () =>
      withAccessToken((token) => fleetApi.listFleetVehicles(token, companyId as string)),
    enabled: canSeeNames && companyId !== undefined,
  });

  // The clock the "last seen" labels read, advanced on a timer so they age without a re-fetch.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const [selectedJobId, setSelectedJobId] = useState<string | undefined>(undefined);

  const rows = useMemo(() => {
    const positionByJob = new Map((positions.data ?? []).map((p) => [p.jobId as string, p]));
    return (jobs.data ?? [])
      .filter((job) => isOnTheRoad(job.status))
      .map((job) => {
        const position = positionByJob.get(job.id);
        const driver = drivers.data?.find((link) => link.driverId === job.driverId);
        const vehicle = vehicles.data?.find((v) => v.id === job.vehicleId);
        const next = nextStop(job);
        const seen = position === undefined ? undefined : lastSeen(position.recordedAt, now);
        const eta = etas.data?.find((e) => e.jobId === job.id);
        return {
          job,
          position,
          seen,
          eta,
          etaLabel:
            eta !== undefined && seen !== undefined ? etaText(eta, seen.freshness, now) : undefined,
          driverName: driver?.driverIdentifier ?? undefined,
          vehicleName: vehicle?.name,
          next,
          distanceM:
            position !== undefined && next !== undefined
              ? straightLineMetres(position.location, next.location)
              : undefined,
        };
      });
  }, [jobs.data, positions.data, etas.data, drivers.data, vehicles.data, now]);

  // The selected vehicle's route to where it is heading, drawn on the map.
  const routeLine = useMemo(() => {
    const eta = rows.find((row) => row.job.id === selectedJobId)?.eta;
    return eta === undefined ? undefined : decodePolyline6(eta.geometry);
  }, [rows, selectedJobId]);

  const markers = useMemo<MapMarker[]>(() => {
    const result: MapMarker[] = [];
    for (const row of rows) {
      if (row.position === undefined || row.seen === undefined) continue;
      result.push({
        id: row.job.id,
        kind: 'vehicle',
        lat: row.position.location.lat,
        lon: row.position.location.lon,
        label: `${row.job.reference}${row.driverName ? ` — ${row.driverName}` : ''} · ${row.seen.label}`,
        color: COLOURS[row.seen.freshness],
        selected: row.job.id === selectedJobId,
      });
    }
    const selected = rows.find((row) => row.job.id === selectedJobId);
    for (const [index, stop] of (selected?.job.stops ?? []).entries()) {
      result.push({
        id: `${selected?.job.id}-${index}`,
        kind: 'stop',
        lat: stop.location.lat,
        lon: stop.location.lon,
        label: `${stop.kind === 'pickup' ? 'Pickup' : 'Delivery'}: ${stop.name}`,
        color: stop.kind === 'pickup' ? '#2563eb' : '#7c3aed',
      });
    }
    return result;
  }, [rows, selectedJobId]);

  const error = companies.error ?? jobs.error ?? positions.error;

  return (
    <div>
      <h1>Live trips</h1>
      <p style={{ color: '#6b7280' }}>
        Vehicles on a job right now. A position only updates while the driver has the app open, so
        check “last seen” before relying on a dot.
      </p>

      {everyCompany && (
        <div style={{ marginBottom: 16 }}>
          <label>
            Company:{' '}
            <select
              value={selectedCompanyId ?? ''}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value || undefined);
                setSelectedJobId(undefined);
              }}
            >
              <option value="">— choose a company —</option>
              {companies.data?.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error !== null && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}

      {companyId === undefined ? (
        <p style={{ color: '#6b7280' }}>
          {everyCompany ? 'Choose a company above.' : 'No company assigned to your account.'}
        </p>
      ) : (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <div
            style={{
              flex: '2 1 420px',
              height: 520,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {!markers.some((m) => m.kind === 'vehicle') && (
              <p className="map-empty">No vehicles on the road right now.</p>
            )}
            <FleetMap
              markers={markers}
              selectedId={selectedJobId}
              onSelect={setSelectedJobId}
              line={routeLine}
            />
          </div>

          <div style={{ flex: '1 1 280px', maxHeight: 520, overflowY: 'auto' }}>
            {jobs.isPending ? (
              <p>Loading…</p>
            ) : rows.length === 0 ? (
              <p style={{ color: '#6b7280' }}>No vehicles on a job right now.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                {rows.map((row) => (
                  <li key={row.job.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedJobId(row.job.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 12,
                        borderRadius: 8,
                        border: `2px solid ${row.job.id === selectedJobId ? '#2563eb' : '#e5e7eb'}`,
                        background: '#fff',
                        color: '#111827',
                        cursor: 'pointer',
                      }}
                    >
                      <strong>{row.job.reference}</strong>
                      {row.driverName && <> · {row.driverName}</>}
                      {row.vehicleName && <> · {row.vehicleName}</>}
                      <div>{STATUS_LABELS[row.job.status]}</div>
                      {row.next && (
                        <div style={{ color: '#6b7280' }}>
                          Heading for {row.next.kind}: {row.next.name}
                          {row.distanceM !== undefined && (
                            <> — {formatMiles(row.distanceM)} away, as the crow flies</>
                          )}
                        </div>
                      )}
                      {row.etaLabel && <div>{row.etaLabel}</div>}
                      <div
                        style={{
                          color: row.seen ? COLOURS[row.seen.freshness] : '#6b7280',
                          fontWeight: 600,
                        }}
                      >
                        {row.seen ? `Last seen ${row.seen.label}` : 'No position yet'}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
