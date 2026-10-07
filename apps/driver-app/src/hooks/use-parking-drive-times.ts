import { useQueries, useQuery } from '@tanstack/react-query';
import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';
import type { VehicleProfileId } from '@wagonwise/contracts/routing';

import * as jobsApi from '../api/jobs';
import * as routingApi from '../api/routing';
import { useCurrentJob } from '../api/use-jobs';
import { useVehicleProfiles } from '../api/use-vehicle-profiles';
import type { MapPoint } from '../components/route-map';
import { useAccessToken } from './use-access-token';

/**
 * Which vehicle profile to time and plan the drive to a parking spot with: the company vehicle's, if
 * the driver is on a job (the same rule as the job's own navigation, so a lorry's height is never
 * guessed), otherwise their own first saved profile. `undefined` while it is being worked out, and
 * when there is none to use.
 */
export function useDrivingProfileId(): VehicleProfileId | undefined {
  const accessToken = useAccessToken();
  const job = useCurrentJob();
  const profiles = useVehicleProfiles();
  const jobId = job.data?.id;
  const personalId = profiles.data?.[0]?.id;

  const query = useQuery({
    queryKey: ['driving-profile', jobId ?? null, personalId ?? null],
    queryFn: async () =>
      jobId !== undefined
        ? (await jobsApi.getNavigationProfile(accessToken, jobId)).profileId
        : (personalId ?? null),
    enabled: !job.isPending && !profiles.isPending,
    staleTime: 5 * 60_000,
  });
  return query.data ?? undefined;
}

export interface DriveTime {
  readonly minutes: number;
  readonly km: number;
}

/**
 * The road drive time and distance from `origin` to each spot, by asking the routing service for the
 * fastest route for the vehicle: the same estimate as comparing routes when planning. One quick
 * request per spot, each independent, so a slow or failed one only leaves its own row without a time.
 * Keyed on the position rounded to about 100 m, so the list is not re-asked on every GPS fix.
 */
export function useParkingDriveTimes(
  origin: MapPoint | undefined,
  spots: readonly SafeParkingSpotDto[],
  profileId: VehicleProfileId | undefined,
): Record<string, DriveTime | undefined> {
  const accessToken = useAccessToken();
  const roundedOrigin = origin
    ? { lat: Math.round(origin.lat * 1000) / 1000, lon: Math.round(origin.lon * 1000) / 1000 }
    : undefined;

  const results = useQueries({
    queries: spots.map((spot) => ({
      queryKey: ['parking-drive-time', profileId ?? null, roundedOrigin ?? null, spot.id],
      queryFn: async (): Promise<DriveTime> => {
        if (!roundedOrigin || !profileId) throw new Error('not ready');
        const options = await routingApi.previewRouteOptions(accessToken, {
          profileId,
          origin: roundedOrigin,
          destination: spot.location,
        });
        const fastest = options.find((o) => o.labels.includes('fastest')) ?? options[0];
        if (!fastest) throw new Error('no route');
        return { minutes: fastest.durationMin, km: fastest.distanceKm };
      },
      enabled: roundedOrigin !== undefined && profileId !== undefined,
      staleTime: 2 * 60_000,
      retry: false,
    })),
  });

  const byId: Record<string, DriveTime | undefined> = {};
  spots.forEach((spot, i) => {
    byId[spot.id] = results[i]?.data;
  });
  return byId;
}
