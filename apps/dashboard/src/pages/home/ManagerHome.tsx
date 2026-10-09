import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as billingApi from '../../api/billing';
import * as checksApi from '../../api/checks';
import * as fleetApi from '../../api/fleet';
import * as hoursApi from '../../api/hours';
import * as jobsApi from '../../api/jobs';
import * as maintenanceApi from '../../api/maintenance';
import { HomeNote, HomePanel, HomeRows, HomeTiles } from '../../components/HomeParts';
import { complianceRows, localDay, lowOnHours, managerTiles, onTheRoad } from '../../lib/home';
import { holds } from '../../state/access';
import { useStaffAuthStore } from '../../state/staff-auth-store';

const MINUTE = 60_000;

/**
 * A fleet manager's or dispatcher's home: what needs a person now, who is on the road, and how the fleet stands on its
 * checks, defects, repairs and plan. Built from the same calls the other pages make; anything the person has no privilege
 * for is not asked for, and one that fails simply leaves its part out. Core checks every request itself.
 */
export function ManagerHome({ companyId }: { companyId: string }) {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);

  const seesChecks =
    holds(me, 'manage_fleet') || holds(me, 'dispatch') || holds(me, 'view_reports');
  const seesMaintenance = holds(me, 'manage_maintenance') || seesChecks;

  // A clock for "waiting 35 min" and late arrivals, advanced a minute at a time.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE);
    return () => clearInterval(timer);
  }, []);
  const today = localDay(now);

  const live = { refetchInterval: MINUTE, retry: false } as const;
  const jobs = useQuery({
    queryKey: ['jobs', companyId],
    queryFn: () => withAccessToken((t) => jobsApi.listJobs(t, companyId)),
    ...live,
  });
  const notices = useQuery({
    queryKey: ['job-notices', companyId],
    queryFn: () => withAccessToken((t) => jobsApi.listJobNotices(t, companyId)),
    ...live,
  });
  const etas = useQuery({
    queryKey: ['job-etas', companyId],
    queryFn: () => withAccessToken((t) => jobsApi.listJobEtas(t, companyId)),
    ...live,
  });
  const drivers = useQuery({
    queryKey: ['driver-links', companyId],
    queryFn: () => withAccessToken((t) => fleetApi.listDriverLinks(t, companyId)),
    retry: false,
  });
  const vehicles = useQuery({
    queryKey: ['fleet-vehicles', companyId],
    queryFn: () => withAccessToken((t) => fleetApi.listFleetVehicles(t, companyId)),
    retry: false,
  });
  const defects = useQuery({
    queryKey: ['check-defects', companyId, 'todo'],
    queryFn: () => withAccessToken((t) => checksApi.listDefects(t, companyId)),
    enabled: seesChecks,
    ...live,
  });
  const checksToday = useQuery({
    queryKey: ['check-results', companyId, today, today],
    queryFn: () =>
      withAccessToken((t) => checksApi.listCheckResults(t, companyId, { from: today, to: today })),
    enabled: seesChecks,
    ...live,
  });
  const overview = useQuery({
    queryKey: ['maintenance-overview', companyId],
    queryFn: () => withAccessToken((t) => maintenanceApi.getOverview(t, companyId)),
    enabled: seesMaintenance,
    ...live,
  });
  const repairs = useQuery({
    queryKey: ['repairs', companyId, 'open'],
    queryFn: () => withAccessToken((t) => maintenanceApi.listRepairs(t, companyId, 'open')),
    enabled: seesMaintenance,
    ...live,
  });
  const plan = useQuery({
    queryKey: ['own-plan'],
    queryFn: () => withAccessToken((t) => billingApi.getOwnPlan(t)),
    enabled: holds(me, 'manage_billing'),
    retry: false,
  });
  const hours = useQuery({
    queryKey: ['hours-status', companyId],
    queryFn: () => withAccessToken((t) => hoursApi.listHoursStatuses(t, companyId)),
    ...live,
  });

  const tiles = managerTiles(
    {
      jobs: jobs.data ?? [],
      notices: notices.data,
      defects: seesChecks ? defects.data : undefined,
      overview: seesMaintenance ? overview.data : undefined,
    },
    now,
  );

  const driverName = (id: string | undefined): string | undefined =>
    drivers.data?.find((l) => l.driverId === id)?.driverIdentifier;
  const road = onTheRoad({
    jobs: jobs.data ?? [],
    etas: etas.data ?? [],
    driverName,
    vehicleName: (id) => vehicles.data?.find((v) => v.id === id)?.name,
    now,
  });
  const lowHours = lowOnHours(hours.data ?? [], (id) => driverName(id));

  const { rows, checksShare } = complianceRows({
    vehicles: vehicles.data,
    checksToday: seesChecks ? checksToday.data : undefined,
    defects: seesChecks ? defects.data : undefined,
    repairs: seesMaintenance ? repairs.data : undefined,
    capacity: plan.data,
    joinRequests: drivers.data?.filter((l) => l.status === 'requested').length,
  });

  return (
    <div>
      <h1>
        {greeting(now)}
        {me === undefined ? '' : `, ${me.name.split(' ')[0] ?? me.name}`}
      </h1>
      <HomeTiles tiles={tiles} loading={jobs.isPending} />
      <div className="home-panels">
        <HomePanel
          title="On the road now"
          area="ops"
          to="/fleet/live-trips"
          linkLabel="Open live trips"
        >
          {jobs.isPending ? (
            <HomeNote>Loading…</HomeNote>
          ) : road.length === 0 ? (
            <HomeNote>No vehicles are on a job right now.</HomeNote>
          ) : (
            <div>
              {road.map((row) => (
                <div key={row.jobId} className="home-row">
                  <span>
                    <strong>{row.reference}</strong>, {row.who}
                  </span>
                  <span className={row.late ? 'tone-warn' : 'muted'}>
                    {row.late ? `Late by ${row.lateBy ?? ''}`.trim() : row.eta}
                  </span>
                </div>
              ))}
            </div>
          )}
          {lowHours.length > 0 && (
            <div className="home-row">
              <span className="muted">Driving hours</span>
              <span className="tone-bad">{lowHours.join('; ')}</span>
            </div>
          )}
        </HomePanel>

        {rows.length > 0 && (
          <HomePanel
            title="Compliance today"
            area="compliance"
            to="/fleet/defects"
            linkLabel="Open defects"
          >
            <HomeRows rows={rows} />
            {checksShare !== undefined && (
              <div className="home-bar" aria-hidden="true">
                <i style={{ width: `${Math.round(checksShare * 100)}%` }} />
              </div>
            )}
          </HomePanel>
        )}
      </div>
    </div>
  );
}

function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
