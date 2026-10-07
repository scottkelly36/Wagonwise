import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { MapPoint } from '../components/route-map';
import { facingDegrees, headingChangedEnough } from '../lib/heading';

/** What the phone reports about its movement with a fix: the GPS course and speed. */
export interface Motion {
  readonly gpsHeadingDeg: number | null;
  readonly speedMps: number | null;
}

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
  onUpdate: (point: MapPoint, motion: Motion) => void,
  /** While driving: a fix every second or two metres, at the phone's navigation accuracy, so the
   *  turn guidance and ETA keep up. Costs more battery, so only the trip screen asks for it. */
  fast = false,
): Promise<WatchResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { ok: false, reason: 'denied' };
  }
  try {
    const subscription = await Location.watchPositionAsync(
      fast
        ? { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 }
        : { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 10 },
      (position) =>
        onUpdate(
          { lat: position.coords.latitude, lon: position.coords.longitude },
          { gpsHeadingDeg: position.coords.heading, speedMps: position.coords.speed },
        ),
    );
    return { ok: true, subscription };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/** The active-trip screen's "map following position" (design doc §8). Only runs in the
 *  foreground — background tracking for reroute alerts is M6 territory (docs/progress.md). */
export function useLiveLocation(options: { readonly fast?: boolean } = {}): {
  readonly status: LiveLocationStatus;
  readonly point: MapPoint | undefined;
  /** Which way the driver is facing, degrees clockwise from north: the GPS course while moving, the
   *  compass when stopped. Undefined until known. */
  readonly heading: number | undefined;
  /** The direction of travel from GPS, only while actually moving; undefined when stopped. For asking
   *  the server for a route that sets off the way the lorry is already going. */
  readonly course: number | undefined;
} {
  const fast = options.fast ?? false;
  const [status, setStatus] = useState<LiveLocationStatus>('loading');
  const [point, setPoint] = useState<MapPoint | undefined>(undefined);
  const [heading, setHeading] = useState<number | undefined>(undefined);
  const [course, setCourse] = useState<number | undefined>(undefined);

  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;
    let cancelled = false;

    // The latest of each input, so the arrow is recomputed whenever either one changes.
    let motion: Motion = { gpsHeadingDeg: null, speedMps: null };
    let compassDeg: number | null = null;
    let shown: number | undefined;
    let shownCourse: number | undefined;
    const refreshHeading = () => {
      const nextCourse = facingDegrees({ ...motion, compassDeg: null });
      if (headingChangedEnough(shownCourse, nextCourse)) {
        shownCourse = nextCourse;
        setCourse(nextCourse);
      }
      const next = facingDegrees({ ...motion, compassDeg });
      if (headingChangedEnough(shown, next)) {
        shown = next;
        setHeading(next);
      }
    };

    let compass: Location.LocationSubscription | undefined;
    void Location.watchHeadingAsync((reading) => {
      if (cancelled) return;
      compassDeg = reading.trueHeading >= 0 ? reading.trueHeading : reading.magHeading;
      refreshHeading();
    })
      .then((sub) => {
        if (cancelled) sub.remove();
        else compass = sub;
      })
      // No compass just means no arrow while stopped; the GPS course still works while moving.
      .catch(() => undefined);

    void startWatchingPosition((next, nextMotion) => {
      if (cancelled) return;
      setStatus('granted');
      setPoint(next);
      motion = nextMotion;
      refreshHeading();
    }, fast).then((result) => {
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
      compass?.remove();
    };
  }, [fast]);

  return { status, point, heading, course };
}
