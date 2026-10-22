import type { RouteCameraDto } from '@wagonwise/contracts/routing';

import { routeProgress, type RoutePoint } from './route-progress';
import { OFF_ROUTE_M } from './turn-guidance';

/** How far ahead along the route a camera is first shown and spoken. */
export const CAMERA_WARNING_AHEAD_M = 500;

export interface CameraOnRoute {
  readonly camera: RouteCameraDto;
  /** Metres along the route to the camera, measured the way the driver's own progress is. */
  readonly offsetM: number;
}

/**
 * Where each camera sits along the route, nearest the start first. Worked out once per route (not on every position
 * update): it snaps each camera onto the route's line, which is slow for a long route.
 */
export function cameraOffsets(
  routeLine: readonly (readonly [number, number])[],
  cameras: readonly RouteCameraDto[],
): CameraOnRoute[] {
  return cameras
    .map((camera) => ({
      camera,
      offsetM: routeProgress(routeLine, camera.location as RoutePoint).traveledMetres,
    }))
    .sort((a, b) => a.offsetM - b.offsetM);
}

export interface CameraAhead {
  readonly camera: RouteCameraDto;
  readonly distanceM: number;
}

/**
 * The next camera on the route, if it is within `withinM` ahead of the driver. A camera just passed is behind and never
 * shown again. Nothing is shown once the driver has left the route, where cameras read for it no longer apply.
 */
export function nextCameraAhead(
  offsets: readonly CameraOnRoute[],
  traveledMetres: number,
  offRouteMetres: number,
  withinM = CAMERA_WARNING_AHEAD_M,
): CameraAhead | undefined {
  if (offRouteMetres > OFF_ROUTE_M) return undefined;
  const next = offsets.find((o) => o.offsetM >= traveledMetres);
  if (!next) return undefined;
  const distanceM = next.offsetM - traveledMetres;
  return distanceM <= withinM ? { camera: next.camera, distanceM } : undefined;
}

/** What is said and shown for a camera. Plain words: it is a courtesy, not a promise (the map is not complete). */
export function cameraWarningText(camera: RouteCameraDto): string {
  switch (camera.kind) {
    case 'red_light':
      return 'Red light camera ahead';
    case 'average':
      return 'Average speed cameras ahead';
    case 'fixed':
      return 'Speed camera ahead';
  }
}
