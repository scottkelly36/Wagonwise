import { useMutation } from '@tanstack/react-query';

import * as routingApi from '../api/routing';
import type { MapPoint } from '../components/route-map';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useAccessToken } from './use-access-token';

export interface ReplanInput {
  /** Where the driver is right now, from the live location the screen already has. */
  readonly here: MapPoint;
  /** The direction they are travelling, if moving. The new route sets off that way. */
  readonly headingDeg: number | undefined;
}

/**
 * "Re-plan from here" (P2-M10): after the driver has left the route, a new route from where they
 * are now to the same destination, with the same vehicle profile. Only ever run by the driver's own
 * tap, never automatically: a surprise new route mid-drive is worse than an old one.
 *
 * Plans from the live position and heading (field test, 2026-10-07: from a one-off fix and with no
 * direction the route could start by sending the lorry back the way it had come). The old trip is
 * ended only once the new route exists, then the new trip is started and both are put in the stores
 * together, so a failure at any step leaves the driver on the route they had.
 */
export function useReplanFromHere() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async ({ here, headingDeg }: ReplanInput) => {
      const plan = useCurrentRoutePlanStore.getState().plan;
      if (plan === undefined) return;
      const trips = useCurrentActiveTripStore.getState();
      const newPlan = await routingApi.planRoute(accessToken, {
        profileId: plan.profileId,
        origin: here,
        destination: plan.destination,
        ...(headingDeg === undefined ? {} : { originHeadingDeg: headingDeg }),
      });
      if (trips.trip !== undefined) await routingApi.endTrip(accessToken, trips.trip.id);
      const newTrip = await routingApi.startTrip(accessToken, newPlan.id);
      useCurrentRoutePlanStore.getState().setPlan(newPlan);
      trips.setTrip(newTrip);
    },
  });
}
