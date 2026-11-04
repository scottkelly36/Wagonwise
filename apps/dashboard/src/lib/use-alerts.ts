import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as checksApi from '../api/checks';
import * as fleetApi from '../api/fleet';
import * as hoursApi from '../api/hours';
import * as jobsApi from '../api/jobs';
import * as maintenanceApi from '../api/maintenance';
import { holds } from '../state/access';
import { useStaffAuthStore } from '../state/staff-auth-store';
import { alertsFrom, type Alert } from './alerts';
import { driverNamesById } from './driver-name';
import { lowOnHours, managerTiles } from './home';

const MINUTE = 60_000;

/**
 * What the bell shows: the Overview's attention tiles and drivers short of hours, for a company's staff. It asks for the
 * same things the Overview does (the same query keys), so on the Overview nothing is fetched twice. Anything the person
 * has no privilege for is not asked for, and one that fails leaves its part out. Platform staff have no company, so no alerts.
 */
export function useAlerts(): { alerts: Alert[]; loading: boolean; available: boolean } {
  const me = useStaffAuthStore((s) => s.session?.staff);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const companyId = me?.companyId;
  const enabled = companyId !== undefined;
  const id = companyId ?? '';

  const seesChecks =
    holds(me, 'manage_fleet') || holds(me, 'dispatch') || holds(me, 'view_reports');
  const seesMaintenance = holds(me, 'manage_maintenance') || seesChecks;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), MINUTE);
    return () => clearInterval(timer);
  }, []);

  const live = { refetchInterval: MINUTE, retry: false } as const;
  const jobs = useQuery({
    queryKey: ['jobs', id],
    queryFn: () => withAccessToken((t) => jobsApi.listJobs(t, id)),
    enabled,
    ...live,
  });
  const notices = useQuery({
    queryKey: ['job-notices', id],
    queryFn: () => withAccessToken((t) => jobsApi.listJobNotices(t, id)),
    enabled,
    ...live,
  });
  const drivers = useQuery({
    queryKey: ['driver-links', id],
    queryFn: () => withAccessToken((t) => fleetApi.listDriverLinks(t, id)),
    enabled,
    retry: false,
  });
  const defects = useQuery({
    queryKey: ['check-defects', id, 'todo'],
    queryFn: () => withAccessToken((t) => checksApi.listDefects(t, id)),
    enabled: enabled && seesChecks,
    ...live,
  });
  const overview = useQuery({
    queryKey: ['maintenance-overview', id],
    queryFn: () => withAccessToken((t) => maintenanceApi.getOverview(t, id)),
    enabled: enabled && seesMaintenance,
    ...live,
  });
  const hours = useQuery({
    queryKey: ['hours-status', id],
    queryFn: () => withAccessToken((t) => hoursApi.listHoursStatuses(t, id)),
    enabled,
    ...live,
  });

  if (!enabled) return { alerts: [], loading: false, available: false };

  const tiles = managerTiles(
    {
      jobs: jobs.data ?? [],
      notices: notices.data,
      defects: seesChecks ? defects.data : undefined,
      overview: seesMaintenance ? overview.data : undefined,
    },
    now,
  );
  const names = driverNamesById(drivers.data ?? []);
  const low = lowOnHours(hours.data ?? [], (driverId) => names.get(driverId));

  return { alerts: alertsFrom(tiles, low), loading: jobs.isPending, available: true };
}
