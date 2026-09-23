import { dimensionsSchema, type DimensionsDto } from '@wagonwise/contracts/routing';

// Pure parsing/validation, no React — testable directly, same split as
// hooks/use-opportunistic-refresh.ts's pure scheduling core.

export interface VehicleProfileFormValues {
  readonly name: string;
  readonly heightM: string;
  readonly widthM: string;
  readonly lengthM: string;
  readonly grossWeightT: string;
  readonly axleWeightT: string;
}

export const EMPTY_VEHICLE_PROFILE_FORM: VehicleProfileFormValues = {
  name: '',
  heightM: '',
  widthM: '',
  lengthM: '',
  grossWeightT: '',
  axleWeightT: '',
};

export interface ParsedVehicleProfile {
  readonly name: string;
  readonly dimensions: DimensionsDto;
}

export type ParseVehicleProfileFormResult =
  | { readonly ok: true; readonly value: ParsedVehicleProfile }
  | { readonly ok: false; readonly message: string };

function toNumber(text: string): number {
  return Number(text.trim());
}

/** Mirrors core's own validateName/validateDimensions (routing/domain/vehicle-profile.ts) so a
 *  driver sees the same "not a positive number" rule before a network round trip, not a
 *  different, looser one that the server would reject anyway. */
export function parseVehicleProfileForm(
  values: VehicleProfileFormValues,
): ParseVehicleProfileFormResult {
  const name = values.name.trim();
  if (!name) {
    return { ok: false, message: 'Give this vehicle a name.' };
  }

  const axleWeightT = values.axleWeightT.trim() === '' ? undefined : toNumber(values.axleWeightT);
  const parsed = dimensionsSchema.safeParse({
    heightM: toNumber(values.heightM),
    widthM: toNumber(values.widthM),
    lengthM: toNumber(values.lengthM),
    grossWeightT: toNumber(values.grossWeightT),
    axleWeightT,
  });
  if (!parsed.success) {
    return { ok: false, message: 'Every measurement must be a positive number.' };
  }
  return { ok: true, value: { name, dimensions: parsed.data } };
}

/** The inverse of parsing — pre-fills the edit form from a profile fetched off the wire. */
export function vehicleProfileFormValuesFrom(profile: {
  readonly name: string;
  readonly dimensions: DimensionsDto;
}): VehicleProfileFormValues {
  return {
    name: profile.name,
    heightM: String(profile.dimensions.heightM),
    widthM: String(profile.dimensions.widthM),
    lengthM: String(profile.dimensions.lengthM),
    grossWeightT: String(profile.dimensions.grossWeightT),
    axleWeightT:
      profile.dimensions.axleWeightT === undefined ? '' : String(profile.dimensions.axleWeightT),
  };
}
