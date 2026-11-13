import type { JobStatus } from '@wagonwise/contracts/jobs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActiveTripDto, RoutePlanDto } from '@wagonwise/contracts/routing';

import { ApiError } from './errors';
import { clearSavedTrip, loadSavedTrip } from '../db/saved-trip';
import { listPendingTripEnds } from '../db/trip-outbox';
import { queueTripEnd, syncTripOutbox } from '../hooks/use-trip-outbox-flush';
import { useAccessToken } from '../hooks/use-access-token';
import { isPermanentRejection } from '../lib/proof-of-delivery-flush';
import { usableSavedTrip } from '../lib/saved-trip';
import * as jobsApi from './jobs';
import * as routingApi from './routing';
import { CURRENT_JOB_KEY } from './use-jobs';

/** The server has no such trip any more (already ended, or never started): there is nothing left to end, so ending it locally is right. */
function isTripGone(error: unknown): boolean {
  return error instanceof ApiError && error.tag === 'ActiveTripNotFound';
}

/** A mutation, not a query — starting a trip is an action a driver takes (design doc §8's "Start
 *  trip"), not data a screen fetches on mount. Same reasoning as `useCreateRoutePlan` (M5.4).
 *  Anything the driver ended with no signal is sent first, or the server would still count the old trip as running. */
export function useStartTrip() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (routePlanId: string) => {
      await syncTripOutbox(accessToken).catch(() => undefined);
      return routingApi.startTrip(accessToken, routePlanId);
    },
  });
}

/**
 * Same reasoning as `useStartTrip` — "End trip" is an action, not a fetch. With no signal (or a server that cannot answer just now) the end is
 * saved on the phone and sent later, and this succeeds, so the driver is not stuck on a trip they have finished. A refusal the server will always
 * give (a trip that is not theirs) is still shown.
 */
export function useEndTrip() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: async (tripId: string): Promise<ActiveTripDto | undefined> => {
      // When the driver tapped, kept if the end has to wait for signal.
      const tapped = new Date().toISOString();
      try {
        return await routingApi.endTrip(accessToken, tripId);
      } catch (error) {
        if (isTripGone(error)) return undefined;
        if (isPermanentRejection(error)) throw error;
        await queueTripEnd({ tripId, endedAt: tapped });
        return undefined;
      }
    },
  });
}

/**
 * "Arrived" on a job being driven: the job moves to its arrival status and the trip ends. With no signal both are saved on the phone, in that order, and
 * sent later; the job screen shows the arrival meanwhile (`withPendingArrival`). A refusal the server will always give for the job is shown, as before.
 * If the arrival reached the server but the end did not, only the end is queued.
 */
export function useArriveAtStop() {
  const accessToken = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { jobId: string; status: JobStatus; tripId: string }) => {
      const tapped = new Date().toISOString();
      try {
        await jobsApi.advanceJobStatus(accessToken, input.jobId, {
          status: input.status,
          at: tapped,
        });
      } catch (error) {
        if (isPermanentRejection(error)) throw error;
        await queueTripEnd({
          tripId: input.tripId,
          endedAt: tapped,
          jobAdvance: { jobId: input.jobId, status: input.status },
        });
        return;
      }
      try {
        await routingApi.endTrip(accessToken, input.tripId);
      } catch (error) {
        if (isTripGone(error)) return;
        if (isPermanentRejection(error)) throw error;
        await queueTripEnd({ tripId: input.tripId, endedAt: tapped });
      }
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: CURRENT_JOB_KEY }),
  });
}

export interface ResumedTrip {
  readonly trip: ActiveTripDto;
  readonly plan: RoutePlanDto;
  /** True when the trip came from the phone because the server could not be reached. */
  readonly fromPhone?: true;
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
 *
 * With no signal it no longer falls back to home: the trip saved on the phone (`db/saved-trip.ts`) is brought back instead, as long as it is
 * this driver's, not a day old, and not one the driver already ended offline. Anything waiting in the outbox is sent first, so the server does not
 * bring an ended trip back, and a server that answers "nothing in progress" clears the saved trip.
 */
export function useResumeActiveTrip(accessToken: string | undefined, driverId?: string) {
  return useQuery({
    queryKey: ['activeTrip', 'resume'],
    queryFn: async (): Promise<ResumedTrip | null> => {
      if (accessToken === undefined) return null;
      const pending = await listPendingTripEnds().catch(() => []);
      const saved = await loadSavedTrip().catch(() => undefined);
      const fromPhone = (): ResumedTrip | null => {
        const usable =
          driverId === undefined ? undefined : usableSavedTrip(saved, driverId, pending);
        return usable === undefined
          ? null
          : { trip: usable.trip, plan: usable.plan, fromPhone: true };
      };
      try {
        await syncTripOutbox(accessToken).catch(() => undefined);
        const trip = await routingApi.getActiveTrip(accessToken);
        if (!trip) {
          if (saved !== undefined) void clearSavedTrip().catch(() => undefined);
          return null;
        }
        const plan = await routingApi.getRoutePlan(accessToken, trip.routePlanId);
        return { trip, plan };
      } catch (error) {
        // A refusal the server will always give is not "no signal": nothing saved would be right either.
        if (isPermanentRejection(error)) throw error;
        return fromPhone();
      }
    },
    enabled: accessToken !== undefined,
    retry: 1,
  });
}
