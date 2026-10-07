import { useMutation } from '@tanstack/react-query';
import type { GeoPointDto, VehicleProfileId } from '@wagonwise/contracts/routing';
import { useRouter } from 'expo-router';

import * as routingApi from '../api/routing';
import { LocationUnavailableError } from '../lib/error-messages';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useAccessToken } from './use-access-token';
import { fetchCurrentLocation } from './use-current-location';

/**
 * "Take me there": plans a route from where the driver is to a chosen place with the given vehicle
 * profile, starts the trip and opens the trip screen, in one tap, as the job's Start does. Hazard and
 * restriction avoidance are the ordinary route planning's. Any trip already running is ended first:
 * the driver's own tap chose this one.
 */
export function useNavigateToPlace(profileId: VehicleProfileId | undefined) {
  const accessToken = useAccessToken();
  const router = useRouter();
  return useMutation({
    mutationFn: async (destination: GeoPointDto) => {
      if (profileId === undefined) return;
      const here = await fetchCurrentLocation();
      if (!here.ok) throw new LocationUnavailableError();

      const trips = useCurrentActiveTripStore.getState();
      const plans = useCurrentRoutePlanStore.getState();
      if (trips.trip !== undefined) {
        await routingApi.endTrip(accessToken, trips.trip.id);
        trips.clear();
        plans.clear();
      }
      const plan = await routingApi.planRoute(accessToken, {
        profileId,
        origin: here.point,
        destination,
      });
      plans.setPlan(plan);
      trips.setTrip(await routingApi.startTrip(accessToken, plan.id));
    },
    onSuccess: () => {
      if (useCurrentActiveTripStore.getState().trip !== undefined) router.push('/active-trip');
    },
  });
}
