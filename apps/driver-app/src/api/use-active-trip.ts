import { useMutation } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as routingApi from './routing';

/** A mutation, not a query — starting a trip is an action a driver takes (design doc §8's "Start
 *  trip"), not data a screen fetches on mount. Same reasoning as `useCreateRoutePlan` (M5.4). */
export function useStartTrip() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (routePlanId: string) => routingApi.startTrip(accessToken, routePlanId),
  });
}

/** Same reasoning as `useStartTrip` — "End trip" is an action, not a fetch. */
export function useEndTrip() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (tripId: string) => routingApi.endTrip(accessToken, tripId),
  });
}
