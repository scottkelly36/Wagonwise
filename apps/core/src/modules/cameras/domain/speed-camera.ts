export interface GeoPoint {
  readonly lat: number;
  readonly lon: number;
}

/** A fixed speed camera, an average-speed camera (a stretch between two points), or a red-light camera. */
export const CAMERA_KINDS = ['fixed', 'average', 'red_light'] as const;
export type CameraKind = (typeof CAMERA_KINDS)[number];

/** A camera position from the map data. Mobile cameras are not in it, and the map is not complete. */
export interface SpeedCamera {
  readonly id: string;
  readonly location: GeoPoint;
  readonly kind: CameraKind;
  /** The limit the map gives for the camera, in mph, when it says one. */
  readonly maxspeedMph: number | undefined;
}
