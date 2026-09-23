import { useMutation } from '@tanstack/react-query';
import type { PlanRouteRequest } from '@wagonwise/contracts/routing';

import { useAccessToken } from '../hooks/use-access-token';
import * as routingApi from './routing';

/** A mutation, not a query — planning a route is an action a driver takes (tap "Plan route"),
 *  not data this screen fetches on mount, and each plan is its own new server-side row (core's
 *  `POST /routing/route-plans` always returns 201), never something to refetch/cache by key. */
export function useCreateRoutePlan() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (input: PlanRouteRequest) => routingApi.planRoute(accessToken, input),
  });
}
