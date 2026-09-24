import { useQuery } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as routingApi from './routing';

/** M6.6's reroute prompt needs the *new* plan a push notification only carries the id of
 *  (`GET /routing/route-plans/:id`, M6.6) — the current one is already in
 *  `current-route-plan-store`, not fetched here. */
export function useRoutePlan(id: string) {
  const accessToken = useAccessToken();
  return useQuery({
    queryKey: ['route-plan', id],
    queryFn: () => routingApi.getRoutePlan(accessToken, id),
  });
}
