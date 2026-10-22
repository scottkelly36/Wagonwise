import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as camerasApi from './cameras';

/** Camera positions come from a fixed set, so they are asked for rarely: once per view, and again only after a long while. */
const NEARBY_CAMERAS_POLL_MS = 10 * 60_000;

/**
 * The map-data cameras around one point (near the driver) or a map view. Disabled until there is a point. `keepPrevious` keeps
 * the last answer while a new view loads, so the markers do not blink as the map is panned.
 */
export function useNearbyCameras(
  corridor: readonly { lat: number; lon: number }[],
  radiusM: number,
  keepPrevious = false,
) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: ['nearby-cameras', corridor, radiusM],
    queryFn: () => camerasApi.findNearbyCameras(accessToken, { corridor: [...corridor], radiusM }),
    enabled: corridor.length > 0,
    refetchInterval: NEARBY_CAMERAS_POLL_MS,
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}
