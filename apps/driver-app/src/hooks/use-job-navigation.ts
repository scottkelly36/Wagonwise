import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import * as jobsApi from '../api/jobs';
import * as routingApi from '../api/routing';
import { CURRENT_JOB_KEY } from '../api/use-jobs';
import { LocationUnavailableError } from '../lib/error-messages';
import { navigationTarget } from '../lib/job-navigation';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { fetchCurrentLocation } from './use-current-location';
import { useAccessToken } from './use-access-token';

/**
 * The driver's "Start" (and "Set off"): plans a route for the job's next stop with the company
 * vehicle's measurements and opens the trip screen, in one tap.
 *
 *  1. For "Set off", moves the job to En route first: the driver has set off whether or not the
 *     navigation then manages to start, so the status is never held back by a failed route.
 *  2. Finds where the driver is, and the stop to go to (the pickup, then the delivery).
 *  3. Ends any trip left running for an earlier leg (the driver's own explicit tap asked for this
 *     one, so nothing is switched silently).
 *  4. Asks the server for the routing profile of the assigned company vehicle, never one the driver
 *     picked, since a wrong height or weight is what puts a lorry under a low bridge.
 *  5. Plans the route with it, which applies the same restriction and hazard avoidance as any
 *     other plan, starts the trip, and opens the trip screen.
 *
 * A failure at any step leaves the job where it is and surfaces `error`; tapping again retries.
 */
export function useJobNavigation() {
  const accessToken = useAccessToken();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { job: JobDto; advanceFirst?: JobStatus | undefined }) => {
      let job = input.job;
      if (input.advanceFirst !== undefined && job.status !== input.advanceFirst) {
        job = await jobsApi.advanceJobStatus(accessToken, job.id, { status: input.advanceFirst });
        queryClient.setQueryData(CURRENT_JOB_KEY, job);
      }

      const target = navigationTarget(job);
      if (target === undefined) return;

      const here = await fetchCurrentLocation();
      if (!here.ok) throw new LocationUnavailableError();

      const trips = useCurrentActiveTripStore.getState();
      const plans = useCurrentRoutePlanStore.getState();
      if (trips.trip !== undefined) {
        await routingApi.endTrip(accessToken, trips.trip.id);
        trips.clear();
        plans.clear();
      }

      const { profileId } = await jobsApi.getNavigationProfile(accessToken, job.id);
      const plan = await routingApi.planRoute(accessToken, {
        profileId,
        origin: here.point,
        destination: target.stop.location,
      });
      plans.setPlan(plan);
      trips.setTrip(await routingApi.startTrip(accessToken, plan.id));
    },
    onSuccess: () => {
      // Only reached with a trip running; a job with nothing to navigate to did not navigate.
      if (useCurrentActiveTripStore.getState().trip !== undefined) router.push('/active-trip');
    },
  });
}
