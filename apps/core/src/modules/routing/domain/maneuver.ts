/**
 * One step of turn-by-turn guidance (P2-M10), in routing's own terms: the engine's turn codes are
 * mapped to these kinds at the edge, so nothing else depends on Valhalla's numbering.
 */
export const MANEUVER_KINDS = [
  'depart',
  'arrive',
  'straight',
  'slight_left',
  'left',
  'sharp_left',
  'slight_right',
  'right',
  'sharp_right',
  'u_turn',
  'keep_left',
  'keep_right',
  'exit_left',
  'exit_right',
  'merge',
  'roundabout',
  'roundabout_exit',
  'ferry',
] as const;

export type ManeuverKind = (typeof MANEUVER_KINDS)[number];

export interface Maneuver {
  readonly kind: ManeuverKind;
  /** What to show: "Turn left onto Hencotes (B6305)." */
  readonly text: string;
  /** What to say once the driver is near it, without any distance (the app adds "In 300 yards,"):
   *  "Turn left onto Hencotes, B6305." Roundabouts carry their exit: "Enter the roundabout and take
   *  the 3rd exit onto A6079." */
  readonly speech: string;
  /** Road names and numbers for this step, e.g. `['Hencotes', 'B6305']`. */
  readonly streetNames: readonly string[];
  /** Metres from this step to the next one. */
  readonly lengthM: number;
  /** Index into the decoded route geometry where this step begins. */
  readonly beginShapeIndex: number;
  /** Which exit to take, for a roundabout. */
  readonly roundaboutExit?: number | undefined;
}
