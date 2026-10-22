/** A camera on the map: one from the map data along the route, or one a driver marked. Drawn apart from hazards. */
export interface CameraMarker {
  readonly id: string;
  readonly location: { readonly lat: number; readonly lon: number };
  /** A van or a police speed check, which comes and goes. Fixed, average-speed and red-light cameras are not. */
  readonly mobile: boolean;
  /** Set for a camera a driver marked: tapping it opens that report, so it can be confirmed or marked gone. */
  readonly hazardId?: string;
}
