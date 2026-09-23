import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';

import type { MapPoint } from '../components/route-map';

export type LocationResult =
  | { readonly ok: true; readonly point: MapPoint }
  | { readonly ok: false; readonly reason: 'denied' | 'error' };

export type CurrentLocationStatus = 'loading' | 'granted' | 'denied' | 'error';

/** A permission denial or a positioning failure are expected outcomes here, not exceptions —
 *  same "expected failures are values" convention the rest of this codebase uses (AGENTS.md
 *  rule 13) — so this never throws; `useCurrentLocation` below reads the result's own
 *  discriminant rather than TanStack Query's isError (which would need string-matching a
 *  thrown error's message to tell "denied" apart from "no fix available"). */
export async function fetchCurrentLocation(): Promise<LocationResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { ok: false, reason: 'denied' };
  }
  try {
    const position = await Location.getCurrentPositionAsync({});
    return {
      ok: true,
      point: { lat: position.coords.latitude, lon: position.coords.longitude },
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Origin "defaults to current location" (design doc §8). Modelled as a query, not a raw
 * useEffect + setState — the same data-fetching shape every other network call in this app
 * uses, and it avoids the "cascading render" pitfall a manual effect+setState hits calling
 * setState from an effect's own call graph (react-hooks/set-state-in-effect flagged exactly
 * that in an earlier version of this hook; TanStack Query's queryFn has no such problem since
 * it owns the async lifecycle itself). `retry` re-runs it — e.g. after a driver grants
 * permission having previously denied it, or moves somewhere with a GPS fix.
 */
export function useCurrentLocation(): {
  readonly status: CurrentLocationStatus;
  readonly point: MapPoint | undefined;
  readonly retry: () => void;
} {
  const query = useQuery({
    queryKey: ['current-location'],
    queryFn: fetchCurrentLocation,
    staleTime: Infinity,
  });

  const status: CurrentLocationStatus = query.isPending
    ? 'loading'
    : query.data?.ok
      ? 'granted'
      : (query.data?.reason ?? 'error');

  return {
    status,
    point: query.data?.ok ? query.data.point : undefined,
    retry: () => void query.refetch(),
  };
}
