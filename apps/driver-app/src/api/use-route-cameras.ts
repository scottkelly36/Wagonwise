import { useQuery } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as routingApi from './routing';

/**
 * The cameras on a planned route. Asked for once per route and kept: they only change when the map data does. Until they
 * arrive, or if they cannot be had, the driver simply gets no camera warnings.
 */
export function useRouteCameras(routePlanId: string | undefined) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: ['route-cameras', routePlanId],
    queryFn: () => routingApi.getRouteCameras(accessToken, routePlanId ?? ''),
    enabled: routePlanId !== undefined,
    staleTime: Infinity,
    retry: 1,
  });
}
