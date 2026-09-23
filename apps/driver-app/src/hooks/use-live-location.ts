import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { MapPoint } from '../components/route-map';

export type LiveLocationStatus = 'loading' | 'granted' | 'denied' | 'error';

export type WatchResult =
  | { readonly ok: true; readonly subscription: Location.LocationSubscription }
  | { readonly ok: false; readonly reason: 'denied' | 'error' };

/**
 * Requests permission then starts a continuous position watch — the async, testable half of
 * `useLiveLocation` below, split out the same way `fetchCurrentLocation` was split from
 * `useCurrentLocation` (M5.4): a permission denial or a watch failure are expected outcomes here
 * too (AGENTS.md rule 13), read from the result's own discriminant rather than thrown.
 *
 * A continuous subscription, unlike `useCurrentLocation`'s one-shot fix — TanStack Query's
 * `queryFn` shape (M5.4's own precedent) doesn't fit an open-ended stream of updates, so this
 * stays a plain `useEffect` subscription instead.
 */
export async function startWatchingPosition(
  onUpdate: (point: MapPoint) => void,
): Promise<WatchResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { ok: false, reason: 'denied' };
  }
  try {
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 },
      (position) => onUpdate({ lat: position.coords.latitude, lon: position.coords.longitude }),
    );
    return { ok: true, subscription };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** The active-trip screen's "map following position" (design doc §8). Only runs in the
 *  foreground — background tracking for reroute alerts is M6 territory (docs/progress.md). */
export function useLiveLocation(): {
  readonly status: LiveLocationStatus;
  readonly point: MapPoint | undefined;
} {
  const [status, setStatus] = useState<LiveLocationStatus>('loading');
  const [point, setPoint] = useState<MapPoint | undefined>(undefined);

  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    void startWatchingPosition((next) => {
      if (cancelled) return;
      setStatus('granted');
      setPoint(next);
    }).then((result) => {
      if (cancelled) {
        if (result.ok) result.subscription.remove();
        return;
      }
      if (result.ok) {
        subscription = result.subscription;
      } else {
        setStatus(result.reason);
      }
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return { status, point };
}
