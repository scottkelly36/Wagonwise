import type { JobDto, JobStatus } from '@wagonwise/contracts/jobs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import * as jobsApi from '../api/jobs';
import * as routingApi from '../api/routing';
import { CURRENT_JOB_KEY } from '../api/use-jobs';
import { navigationTarget } from '../lib/job-navigation';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useAccessToken } from './use-access-token';

/**
 * The driver's "Start" (and "Set off"): gets the job ready for navigation and opens the route choice (`/job-route`), where they pick a route the way a personal
 * trip does, then see the overview and start the trip.
 *
 *  1. For "Set off", moves the job to En route first: the driver has set off whether or not the
 *     navigation then manages to start, so the status is never held back by a failed route.
 *  2. Finds the stop to go to (the pickup, then the delivery). With none, nothing happens.
 *  3. Ends any trip left running for an earlier leg (the driver's own explicit tap asked for this
 *     one, so nothing is switched silently).
 *  4. Opens the route choice. There the vehicle is the assigned company vehicle's, never one the driver
 *     picked, since a wrong height or weight is what puts a lorry under a low bridge, and the route is
 *     made from where the driver is, with the same restriction and hazard avoidance as any other plan.
 *
 * A failure at any step leaves the job where it is and surfaces `error`; tapping again retries.
 */
export function useJobNavigation() {
  const accessToken = useAccessToken();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      job: JobDto;
      advanceFirst?: JobStatus | undefined;
    }): Promise<boolean> => {
      let job = input.job;
      if (input.advanceFirst !== undefined && job.status !== input.advanceFirst) {
        job = await jobsApi.advanceJobStatus(accessToken, job.id, { status: input.advanceFirst });
        queryClient.setQueryData(CURRENT_JOB_KEY, job);
      }

      const target = navigationTarget(job);
      if (target === undefined) return false;

      const trips = useCurrentActiveTripStore.getState();
      const plans = useCurrentRoutePlanStore.getState();
      if (trips.trip !== undefined) {
        await routingApi.endTrip(accessToken, trips.trip.id);
        trips.clear();
        plans.clear();
      }

      return true;
    },
    onSuccess: (navigate) => {
      // A job with nothing to navigate to did not navigate.
      if (navigate) router.push('/job-route');
    },
  });
}
