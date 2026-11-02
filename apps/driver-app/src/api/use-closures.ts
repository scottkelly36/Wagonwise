import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as closuresApi from './closures';

/** The server's copy is replaced every ten minutes, so asking more often than this finds nothing new. */
const NEARBY_CLOSURES_POLL_MS = 5 * 60_000;

/** Closures starting further ahead than this are not worth a marker yet: tonight and the next few days. */
const CLOSURES_LOOKAHEAD_DAYS = 7;

/**
 * The road and lane closures around a point (in force now, or starting within a week). Disabled until there is a point.
 * `keepPrevious` keeps the last answer while a new map view loads, so the markers do not blink as it is panned.
 */
export function useNearbyClosures(
  centre: { lat: number; lon: number } | undefined,
  radiusM: number,
  limit: number,
  keepPrevious = false,
) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: ['nearby-closures', centre, radiusM, limit],
    queryFn: () =>
      closuresApi.findNearbyClosures(accessToken, {
        centre: centre ?? { lat: 0, lon: 0 },
        radiusM,
        withinDays: CLOSURES_LOOKAHEAD_DAYS,
        limit,
      }),
    enabled: centre !== undefined,
    refetchInterval: NEARBY_CLOSURES_POLL_MS,
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}

/**
 * The closures along a planned route, in force now or starting within the next two days. Asked for once per route and refreshed every
 * few minutes while the screen is open, since a closure can be added or lifted while a driver is deciding. Nothing shows until they
 * arrive; if they cannot be had the driver simply sees no warning (as for the hazards and the speed limits).
 */
export function useClosuresAlongRoute(corridor: readonly { lat: number; lon: number }[]) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: ['route-closures', corridor],
    queryFn: () => closuresApi.findClosuresAlongRoute(accessToken, { corridor: [...corridor] }),
    enabled: corridor.length > 1,
    refetchInterval: NEARBY_CLOSURES_POLL_MS,
    retry: 1,
  });
}
