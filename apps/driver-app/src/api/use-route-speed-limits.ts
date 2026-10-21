import { useQuery } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as routingApi from './routing';

/**
 * The speed limits to show along a planned route. Asked for once per route and kept: they only change when the map data does.
 * Nothing shows until they arrive, and if they cannot be had the driver simply sees no sign.
 */
export function useRouteSpeedLimits(routePlanId: string | undefined) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: ['route-speed-limits', routePlanId],
    queryFn: () => routingApi.getRouteSpeedLimits(accessToken, routePlanId ?? ''),
    enabled: routePlanId !== undefined,
    staleTime: Infinity,
    retry: 1,
  });
}
