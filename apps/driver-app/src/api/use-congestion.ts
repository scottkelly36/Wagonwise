import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReportCongestionRequest } from '@wagonwise/contracts/congestion';
import type { GeoPointDto } from '@wagonwise/contracts/routing';

import { useAccessToken } from '../hooks/use-access-token';
import * as congestionApi from './congestion';

const NEARBY_CONGESTION_KEY = ['congestion', 'nearby'] as const;

/** Same 90s poll cadence as `useNearbyHazards` — no websockets in Phase 1. */
const NEARBY_CONGESTION_POLL_MS = 90_000;

/** A mutation, not a query — reporting congestion is an action a driver takes, same reasoning as
 *  `useReportHazard`. */
export function useReportCongestion() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReportCongestionRequest) =>
      congestionApi.reportCongestion(accessToken, input),
    // A driver's own report should show up on the map immediately, not wait for the next poll.
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: NEARBY_CONGESTION_KEY }),
  });
}

/** `corridor` is one point for "near me" (home screen, Phase 1's only consumer) — disabled
 *  entirely until there's at least one point, same reasoning as `useNearbyHazards`. */
export function useNearbyCongestion(corridor: readonly GeoPointDto[], radiusM: number) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: [...NEARBY_CONGESTION_KEY, corridor, radiusM],
    queryFn: () =>
      congestionApi.findNearbyCongestion(accessToken, { corridor: [...corridor], radiusM }),
    enabled: corridor.length > 0,
    refetchInterval: NEARBY_CONGESTION_POLL_MS,
  });
}
