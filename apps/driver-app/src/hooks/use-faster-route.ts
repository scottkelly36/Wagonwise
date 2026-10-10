import { useMutation } from '@tanstack/react-query';
import type { FasterRouteCheckResponse } from '@wagonwise/contracts/routing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import * as routingApi from '../api/routing';
import type { MapPoint } from '../components/route-map';
import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, OFFER_VISIBLE_MS } from '../lib/faster-route';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useFasterRouteStore } from '../state/faster-route-store';
import { useAccessToken } from './use-access-token';

export type FasterRouteOffer = NonNullable<FasterRouteCheckResponse['offer']>;

/**
 * While the trip screen is open: every few minutes, while the app is in front, asks core whether a clearly quicker route exists
 * from where the lorry is now (counting traffic and other drivers' reports), and holds the answer for about a minute. It only ever
 * offers. Nothing changes unless the driver taps Switch, which swaps to the new route the way "Re-plan from here" does: the new route
 * is made and started first, so a failure at any step leaves the driver on the route they had. Keep remembers the choice for the rest
 * of the trip, so the same route is not offered again. A failed check is silent: it is a nicety, not something to interrupt a drive.
 */
export function useFasterRoute(
  tripId: string | undefined,
  position: MapPoint | undefined,
  headingDeg: number | undefined,
) {
  const accessToken = useAccessToken();
  const enabled = useFasterRouteStore((s) => s.enabled);
  // The offer is tied to the trip it was made for, so a new trip (or turning suggestions off) shows nothing without a reset.
  const [held, setHeld] = useState<{ tripId: string; offer: FasterRouteOffer } | undefined>(
    undefined,
  );
  const offer = enabled && held !== undefined && held.tripId === tripId ? held.offer : undefined;

  // The latest of these, read when a check runs, so the timers below are not rebuilt at every GPS fix.
  const latest = useRef({ position, headingDeg, offer });
  useEffect(() => {
    latest.current = { position, headingDeg, offer };
  });

  useEffect(() => {
    if (tripId === undefined || !enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const check = async (): Promise<void> => {
      const { position: here, headingDeg: heading, offer: showing } = latest.current;
      if (AppState.currentState !== 'active' || here === undefined || showing !== undefined) return;
      try {
        const found = await routingApi.checkFasterRoute(accessToken, tripId, {
          position: here,
          ...(heading === undefined ? {} : { headingDeg: heading }),
          keptKeys: [...(useFasterRouteStore.getState().keptByTrip[tripId] ?? [])],
        });
        if (cancelled || found === null) return;
        setHeld({ tripId, offer: found });
        hideTimer = setTimeout(() => setHeld(undefined), OFFER_VISIBLE_MS);
      } catch {
        // Silent: try again at the next check.
      }
    };

    const schedule = (delayMs: number): void => {
      timer = setTimeout(() => {
        void check().finally(() => {
          if (!cancelled) schedule(CHECK_INTERVAL_MS);
        });
      }, delayMs);
    };
    schedule(FIRST_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (hideTimer !== undefined) clearTimeout(hideTimer);
    };
  }, [tripId, enabled, accessToken]);

  const switchMutation = useMutation({
    mutationFn: async (chosen: FasterRouteOffer) => {
      const newPlan = await routingApi.getRoutePlan(accessToken, chosen.routePlanId);
      const trips = useCurrentActiveTripStore.getState();
      if (trips.trip !== undefined) await routingApi.endTrip(accessToken, trips.trip.id);
      const newTrip = await routingApi.startTrip(accessToken, newPlan.id);
      useCurrentRoutePlanStore.getState().setPlan(newPlan);
      trips.setTrip(newTrip);
    },
    onSuccess: () => setHeld(undefined),
  });

  const keep = useCallback(() => {
    const showing = latest.current.offer;
    if (tripId !== undefined && showing !== undefined) {
      useFasterRouteStore.getState().keep(tripId, showing.key);
    }
    setHeld(undefined);
  }, [tripId]);

  return {
    offer,
    keep,
    switchNow: () => {
      if (offer !== undefined) switchMutation.mutate(offer);
    },
    switching: switchMutation.isPending,
    switchFailed: switchMutation.isError,
  };
}
