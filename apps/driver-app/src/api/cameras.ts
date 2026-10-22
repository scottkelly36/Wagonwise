import {
  findNearbyCamerasResponseSchema,
  type FindNearbyCamerasRequest,
} from '@wagonwise/contracts/cameras';
import type { RouteCameraDto } from '@wagonwise/contracts/routing';

import { requestJson, throwUnlessSuccess } from './http';

/** The speed and red-light cameras around a point or a map view, for the home map (positions from OpenStreetMap; not complete). */
export async function findNearbyCameras(
  accessToken: string,
  input: FindNearbyCamerasRequest,
): Promise<RouteCameraDto[]> {
  const { status, json } = await requestJson('POST', '/cameras/nearby', {
    body: input,
    authorization: `Bearer ${accessToken}`,
  });
  throwUnlessSuccess(status, json, [200]);
  return findNearbyCamerasResponseSchema.parse(json).cameras;
}
