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
