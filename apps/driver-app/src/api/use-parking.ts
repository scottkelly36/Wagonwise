import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReportSafeParkingSpotRequest } from '@wagonwise/contracts/parking';
import type { GeoPointDto } from '@wagonwise/contracts/routing';

import { useAccessToken } from '../hooks/use-access-token';
import * as parkingApi from './parking';

const NEARBY_PARKING_KEY = ['parking', 'nearby'] as const;

/** Same 90s poll cadence as `useNearbyCongestion`/`useNearbyHazards` — no websockets in Phase 1. */
const NEARBY_PARKING_POLL_MS = 90_000;

/** A mutation, not a query — reporting a safe parking spot is an action a driver takes, same
 *  reasoning as `useReportCongestion`. */
export function useReportSafeParkingSpot() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReportSafeParkingSpotRequest) =>
      parkingApi.reportSafeParkingSpot(accessToken, input),
    // A driver's own report should show up on the map immediately, not wait for the next poll.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: NEARBY_PARKING_KEY }),
  });
}

/** `corridor` is one point for "near me" (home screen, Phase 1's only consumer) — disabled
 *  entirely until there's at least one point, same reasoning as `useNearbyCongestion`. */
export function useNearbySafeParkingSpots(corridor: readonly GeoPointDto[], radiusM: number) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: [...NEARBY_PARKING_KEY, corridor, radiusM],
    queryFn: () =>
      parkingApi.findNearbySafeParkingSpots(accessToken, { corridor: [...corridor], radiusM }),
    enabled: corridor.length > 0,
    refetchInterval: NEARBY_PARKING_POLL_MS,
  });
}
