import type { TripTrafficDto } from '@wagonwise/contracts/routing';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import * as routingApi from '../api/routing';
import type { MapPoint } from '../components/route-map';
import { FIRST_TRAFFIC_DELAY_MS, TRAFFIC_INTERVAL_MS } from '../lib/trip-traffic';
import { useAccessToken } from './use-access-token';

/**
 * While the trip screen is open: asks core every few minutes how much live traffic and other drivers' reports add to what is
 * left of the route, from where the lorry is now, so the arrival time can include it. Holds the last answer; a failed ask is
 * silent and keeps what it had (the arrival time just stays as it was). The answer belongs to the trip it was asked for.
 */
export function useTripTraffic(
  tripId: string | undefined,
  position: MapPoint | undefined,
): TripTrafficDto | undefined {
  const accessToken = useAccessToken();
  const [held, setHeld] = useState<{ tripId: string; traffic: TripTrafficDto } | undefined>(
    undefined,
  );

  // The latest position, read when an ask runs, so the timers below are not rebuilt at every GPS fix.
  const latest = useRef(position);
  useEffect(() => {
    latest.current = position;
  });

  useEffect(() => {
    if (tripId === undefined) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const ask = async (): Promise<void> => {
      const here = latest.current;
      if (AppState.currentState !== 'active' || here === undefined) return;
      try {
        const traffic = await routingApi.getTripTraffic(accessToken, tripId, here);
        if (!cancelled) setHeld({ tripId, traffic });
      } catch {
        // Silent: keep what we had and try again at the next ask.
      }
    };

    const schedule = (delayMs: number): void => {
      timer = setTimeout(() => {
        void ask().finally(() => {
          if (!cancelled) schedule(TRAFFIC_INTERVAL_MS);
        });
      }, delayMs);
    };
    schedule(FIRST_TRAFFIC_DELAY_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [tripId, accessToken]);

  return held !== undefined && held.tripId === tripId ? held.traffic : undefined;
}
