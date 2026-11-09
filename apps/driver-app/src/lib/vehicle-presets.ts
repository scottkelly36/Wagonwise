import type { DimensionsDto } from '@wagonwise/contracts/routing';

import type { VehicleProfileFormValues } from './vehicle-profile-form';

/**
 * Typical UK lorry sizes, so a driver who does not know their exact height and weight can start from the nearest match
 * and change what is different. A preset only fills the form: the driver sees the figures and presses Add, so nothing is
 * saved that they have not looked at.
 *
 * Routing takes these numbers literally (a low bridge is avoided or not by the height), so they lean to the cautious side
 * where a vehicle varies: heights are at or above the common figure for the class, never below it. They are typical sizes,
 * not a promise about anyone's vehicle, and the screen says to check the height. No preset is for a tall or double-deck
 * trailer or an abnormal load: those drivers type their own.
 *
 * Widths follow the UK maximum of 2.55 m (a small lorry is a little narrower). Fuel economy is left out on purpose: a
 * guessed figure would put a wrong cost on every route.
 */
/** Which side-on line drawing shows the preset (`components/vehicle-drawing.tsx`). */
export type VehicleDrawingKind =
  'small-rigid' | 'rigid-2-axle' | 'rigid-3-axle' | 'rigid-4-axle' | 'artic';

export interface VehiclePreset {
  readonly id: string;
  readonly name: string;
  readonly drawing: VehicleDrawingKind;
  /** One line under the name: what the vehicle is. */
  readonly description: string;
  readonly dimensions: DimensionsDto;
}

export const VEHICLE_PRESETS: readonly VehiclePreset[] = [
  {
    id: 'rigid-7-5',
    name: '7.5 tonne lorry',
    drawing: 'small-rigid',
    description: 'Two axles, box or curtainside',
    dimensions: { heightM: 3.7, widthM: 2.5, lengthM: 8, grossWeightT: 7.5 },
  },
  {
    id: 'rigid-18',
    name: '18 tonne rigid',
    drawing: 'rigid-2-axle',
    description: 'Two axles, box or curtainside',
    dimensions: { heightM: 4, widthM: 2.55, lengthM: 10, grossWeightT: 18 },
  },
  {
    id: 'rigid-26',
    name: '26 tonne rigid',
    drawing: 'rigid-3-axle',
    description: 'Three axles, box or curtainside',
    dimensions: { heightM: 4, widthM: 2.55, lengthM: 11, grossWeightT: 26 },
  },
  {
    id: 'rigid-32',
    name: '32 tonne rigid',
    drawing: 'rigid-4-axle',
    description: 'Four axles, an eight-wheeler',
    dimensions: { heightM: 4, widthM: 2.55, lengthM: 10.5, grossWeightT: 32 },
  },
  {
    id: 'artic-44',
    name: 'Artic, 44 tonnes',
    drawing: 'artic',
    description: 'Tractor unit and standard trailer',
    dimensions: { heightM: 4.2, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 },
  },
];

/** The form's starting values for a preset: its name (the driver can rename it) and its figures. */
export function presetFormValues(preset: VehiclePreset): VehicleProfileFormValues {
  const { heightM, widthM, lengthM, grossWeightT, axleWeightT } = preset.dimensions;
  return {
    name: preset.name,
    heightM: String(heightM),
    widthM: String(widthM),
    lengthM: String(lengthM),
    grossWeightT: String(grossWeightT),
    axleWeightT: axleWeightT === undefined ? '' : String(axleWeightT),
    fuelConsumptionL100km: '',
  };
}
