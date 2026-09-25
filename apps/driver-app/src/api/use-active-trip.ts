import { useMutation, useQuery } from '@tanstack/react-query';
import type { ActiveTripDto, RoutePlanDto } from '@wagonwise/contracts/routing';

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

/**
 * The one exception to "every hook here takes `useAccessToken()`" — called from `index.tsx`'s
 * gate, before sign-in status is known, so `accessToken` arrives as `undefined` until the caller
 * has one to give it (`enabled` follows). Resumes a trip the local, ephemeral trip store lost
 * track of after a relaunch (design decision, 2026-09-24: fixes "already have one in progress"
 * dead-ending a driver who never tapped "End trip") — also fetches the trip's `RoutePlan`, since
 * `active-trip.tsx` needs both to render. `retry: 1` rather than the default: this gates app
 * launch, so a flaky/offline backend should fall back to `/home` quickly, not stall the driver
 * behind several retries for a resume check that isn't the common case anyway.
 */
export function useResumeActiveTrip(accessToken: string | undefined) {
  return useQuery({
    queryKey: ['activeTrip', 'resume'],
    queryFn: async (): Promise<{ trip: ActiveTripDto; plan: RoutePlanDto } | null> => {
      if (accessToken === undefined) return null;
      const trip = await routingApi.getActiveTrip(accessToken);
      if (!trip) return null;
      const plan = await routingApi.getRoutePlan(accessToken, trip.routePlanId);
      return { trip, plan };
    },
    enabled: accessToken !== undefined,
    retry: 1,
  });
}
