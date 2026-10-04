import { useMutation } from '@tanstack/react-query';

import * as routingApi from '../api/routing';
import { LocationUnavailableError } from '../lib/error-messages';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { fetchCurrentLocation } from './use-current-location';
import { useAccessToken } from './use-access-token';

/**
 * "Re-plan from here" (P2-M10): after the driver has left the route, a new route from where they
 * are now to the same destination, with the same vehicle profile. Only ever run by the driver's own
 * tap, never automatically: a surprise new route mid-drive is worse than an old one.
 *
 * Ends the old trip and starts one on the new plan, as the job "Start" does; the trip screen
 * re-renders on the new plan and the guidance starts afresh.
 */
export function useReplanFromHere() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async () => {
      const here = await fetchCurrentLocation();
      if (!here.ok) throw new LocationUnavailableError();

      const plan = useCurrentRoutePlanStore.getState().plan;
      if (plan === undefined) return;
      const trips = useCurrentActiveTripStore.getState();
      const newPlan = await routingApi.planRoute(accessToken, {
        profileId: plan.profileId,
        origin: here.point,
        destination: plan.destination,
      });
      if (trips.trip !== undefined) await routingApi.endTrip(accessToken, trips.trip.id);
      const newTrip = await routingApi.startTrip(accessToken, newPlan.id);
      useCurrentRoutePlanStore.getState().setPlan(newPlan);
      trips.setTrip(newTrip);
    },
  });
}
