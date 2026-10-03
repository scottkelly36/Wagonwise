import { dimensionsSchema, type DimensionsDto } from '@wagonwise/contracts/routing';
import { z } from 'zod';

// Pure parsing/validation, no React — testable directly, same split as
// hooks/use-opportunistic-refresh.ts's pure scheduling core.

export interface VehicleProfileFormValues {
  readonly name: string;
  readonly heightM: string;
  readonly widthM: string;
  readonly lengthM: string;
  readonly grossWeightT: string;
  readonly axleWeightT: string;
  /** M9 (docs/progress.md): a sibling of dimensions, not one of them — never sent to Valhalla,
   *  only feeds the rough fuel-cost estimate shown on route options. */
  readonly fuelConsumptionL100km: string;
}

export const EMPTY_VEHICLE_PROFILE_FORM: VehicleProfileFormValues = {
  name: '',
  heightM: '',
  widthM: '',
  lengthM: '',
  grossWeightT: '',
  axleWeightT: '',
  fuelConsumptionL100km: '',
};

export interface ParsedVehicleProfile {
  readonly name: string;
  readonly dimensions: DimensionsDto;
  readonly fuelConsumptionL100km?: number | undefined;
}

export type ParseVehicleProfileFormResult =
  | { readonly ok: true; readonly value: ParsedVehicleProfile }
  | { readonly ok: false; readonly message: string };

function toNumber(text: string): number {
  return Number(text.trim());
}

const fuelConsumptionSchema = z.number().positive();

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

  if (values.fuelConsumptionL100km.trim() === '') {
    return { ok: true, value: { name, dimensions: parsed.data } };
  }
  const fuelConsumption = fuelConsumptionSchema.safeParse(toNumber(values.fuelConsumptionL100km));
  if (!fuelConsumption.success) {
    return { ok: false, message: 'Fuel consumption must be a positive number.' };
  }
  return {
    ok: true,
    value: { name, dimensions: parsed.data, fuelConsumptionL100km: fuelConsumption.data },
  };
}

/** The inverse of parsing — pre-fills the edit form from a profile fetched off the wire. */
export function vehicleProfileFormValuesFrom(profile: {
  readonly name: string;
  readonly dimensions: DimensionsDto;
  readonly fuelConsumptionL100km?: number | undefined;
}): VehicleProfileFormValues {
  return {
    name: profile.name,
    heightM: String(profile.dimensions.heightM),
    widthM: String(profile.dimensions.widthM),
    lengthM: String(profile.dimensions.lengthM),
    grossWeightT: String(profile.dimensions.grossWeightT),
    axleWeightT:
      profile.dimensions.axleWeightT === undefined ? '' : String(profile.dimensions.axleWeightT),
    fuelConsumptionL100km:
      profile.fuelConsumptionL100km === undefined ? '' : String(profile.fuelConsumptionL100km),
  };
}

export type DimensionField = 'heightM' | 'widthM' | 'lengthM' | 'grossWeightT' | 'axleWeightT';

/**
 * Gentle checks on a profile that parses fine but looks unusual for a UK lorry. These only warn,
 * never block: wide, long and heavy loads are exactly what part of this product is for. They exist
 * because routing treats the numbers literally. A 4 m wide vehicle is routed round every road with a
 * width restriction and ends up on back roads, and nothing else tells the driver why (found by the
 * owner, 2026-10-03, from a test profile with a slipped width).
 *
 * Limits are the UK's standard maxima: 2.55 m wide (2.6 m for a refrigerated body), 16.5 m for an
 * articulated lorry and 18.75 m for a road train, 44 tonnes gross, 11.5 tonnes on a drive axle.
 * There is no legal height limit; 4.95 m is simply taller than almost any UK lorry.
 */
export function dimensionWarnings(
  values: VehicleProfileFormValues,
): Partial<Record<DimensionField, string>> {
  const warnings: Partial<Record<DimensionField, string>> = {};
  const read = (text: string): number | undefined => {
    if (text.trim() === '') return undefined;
    const n = Number(text.trim());
    return Number.isFinite(n) ? n : undefined;
  };
  const width = read(values.widthM);
  const height = read(values.heightM);
  const length = read(values.lengthM);
  const weight = read(values.grossWeightT);
  const axle = read(values.axleWeightT);

  if (width !== undefined && width > 2.6) {
    warnings.widthM =
      'A normal lorry is up to 2.55 m wide (2.6 m for a fridge body). Routes will avoid roads with width limits. Only keep this if the vehicle really is that wide.';
  }
  if (height !== undefined && height > 4.95) {
    warnings.heightM = 'That is taller than almost any UK lorry. Check the figure.';
  }
  if (length !== undefined && length > 18.75) {
    warnings.lengthM = 'Longer than a road train (18.75 m). Check the figure.';
  }
  if (weight !== undefined && weight > 44) {
    warnings.grossWeightT = 'Over 44 tonnes, the normal UK maximum. Check the figure.';
  }
  if (axle !== undefined && axle > 11.5) {
    warnings.axleWeightT =
      'Over 11.5 tonnes, the normal UK limit for a drive axle. Check the figure.';
  }
  return warnings;
}
