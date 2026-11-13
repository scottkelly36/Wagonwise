import type { HazardReportDto } from '@wagonwise/contracts/hazards';
import { useMemo } from 'react';

import { useNearbyHazards } from '../api/use-hazards';
import type { MapPoint, RouteOptionLine } from '../components/route-map';
import { withoutCameras } from '../lib/camera-report';
import { placeOnRoute } from '../lib/on-route';
import { thinPoints } from '../lib/thin-points';

// No line to look along yet: hazards are asked for only once there are routes.
const NO_CORRIDOR: readonly MapPoint[] = [];
/** Once there are routes to look along: the width the server looks either side of them, before the exact "on the road" cut. */
const ON_ROUTE_HAZARD_RADIUS_M = 750;
/** The most points the server takes for the line of a request. */
const CORRIDOR_MAX_POINTS = 1500;

export interface RouteOptionHazards {
  /** Every hazard near any of the routes, once known; `undefined` until then (and while there are no routes). */
  readonly nearby: readonly HazardReportDto[] | undefined;
  /** How many hazards are on each route, by the route's place in the list. `undefined` until they are known. */
  readonly counts: readonly number[] | undefined;
  /** The nearby hazards that are on at least one route, for drawing. */
  readonly shown: readonly HazardReportDto[];
}

/**
 * The known hazards on each of the routes being compared, for the count on each route card (and the markers on the map). Once the routes are compared, only
 * what is on one of the routes counts: a hazard a few streets over, or on the road that crosses, is not on the way. Nothing is asked for until there are routes.
 */
export function useRouteOptionHazards(
  optionLines: readonly RouteOptionLine[] | undefined,
): RouteOptionHazards {
  const corridor = useMemo(
    () =>
      optionLines?.flatMap((o) =>
        thinPoints(
          o.line.map(([lon, lat]) => ({ lat, lon })),
          Math.floor(CORRIDOR_MAX_POINTS / optionLines.length),
        ),
      ),
    [optionLines],
  );
  const nearby = useNearbyHazards(corridor ?? NO_CORRIDOR, ON_ROUTE_HAZARD_RADIUS_M);

  const byOption = useMemo(() => {
    const found = withoutCameras(nearby.data ?? []);
    return (optionLines ?? []).map(
      (option) => new Set(placeOnRoute(option.line, found).map((placed) => placed.item.id)),
    );
  }, [nearby.data, optionLines]);

  const shown = useMemo(() => {
    if (!optionLines) return [];
    const onAnyRoute = new Set<string>();
    for (const option of optionLines) {
      for (const placed of placeOnRoute(option.line, nearby.data ?? [])) {
        onAnyRoute.add(placed.item.id);
      }
    }
    return (nearby.data ?? []).filter((h) => onAnyRoute.has(h.id));
  }, [nearby.data, optionLines]);

  const counts = useMemo(
    () =>
      nearby.data === undefined || optionLines === undefined
        ? undefined
        : byOption.map((ids) => ids.size),
    [nearby.data, optionLines, byOption],
  );

  return { nearby: nearby.data, counts, shown };
}
