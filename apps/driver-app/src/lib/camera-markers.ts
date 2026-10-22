import type { HazardTypeDto } from '@wagonwise/contracts/hazards';
import type { RouteCameraDto } from '@wagonwise/contracts/routing';

import type { CameraMarker } from './camera-marker-type';
import { isCameraType } from './camera-report';
import { distanceMetres } from './geo-distance';

/** A map-data camera this close to a camera a driver marked is the same camera, and is not drawn twice. */
const SAME_CAMERA_M = 40;

/**
 * Every camera to draw: the driver-marked ones (from the hazards near the route) and the map-data ones along it. A map-data
 * camera that a driver has marked as well is left out, so there is one marker, and it is the one that can be tapped.
 */
export function cameraMarkers(
  fromMap: readonly RouteCameraDto[] | undefined,
  hazards:
    | readonly {
        readonly id: string;
        readonly type: HazardTypeDto;
        readonly location: { readonly lat: number; readonly lon: number };
      }[]
    | undefined,
): CameraMarker[] {
  const reported: CameraMarker[] = (hazards ?? [])
    .filter((h) => isCameraType(h.type))
    .map((h) => ({
      id: `reported-${h.id}`,
      location: h.location,
      mobile: h.type === 'mobile_camera',
      hazardId: h.id,
    }));
  const fixedReported = reported.filter((r) => !r.mobile);
  const mapMarkers: CameraMarker[] = (fromMap ?? [])
    .filter(
      (c) => !fixedReported.some((r) => distanceMetres(r.location, c.location) <= SAME_CAMERA_M),
    )
    .map((c) => ({ id: `map-${c.id}`, location: c.location, mobile: false }));
  return [...mapMarkers, ...reported];
}
