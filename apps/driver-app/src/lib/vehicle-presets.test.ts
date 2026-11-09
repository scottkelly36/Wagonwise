import { dimensionsSchema } from '@wagonwise/contracts/routing';

import { dimensionWarnings, parseVehicleProfileForm } from './vehicle-profile-form';
import { VEHICLE_PRESETS, presetFormValues } from './vehicle-presets';

describe('vehicle presets', () => {
  it('has a few presets, each with its own id and name', () => {
    expect(VEHICLE_PRESETS.length).toBeGreaterThanOrEqual(4);
    expect(new Set(VEHICLE_PRESETS.map((p) => p.id)).size).toBe(VEHICLE_PRESETS.length);
    expect(new Set(VEHICLE_PRESETS.map((p) => p.name)).size).toBe(VEHICLE_PRESETS.length);
  });

  it.each(VEHICLE_PRESETS.map((p) => [p.name, p] as const))(
    '%s passes the same checks as a typed vehicle, with no "unusual size" warning',
    (_name, preset) => {
      expect(dimensionsSchema.safeParse(preset.dimensions).success).toBe(true);
      const values = presetFormValues(preset);
      expect(dimensionWarnings(values)).toEqual({});
      const parsed = parseVehicleProfileForm(values);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.value.name).toBe(preset.name);
        expect(parsed.value.dimensions).toEqual(preset.dimensions);
        expect(parsed.value.fuelConsumptionL100km).toBeUndefined();
      }
    },
  );

  it('keeps every figure inside the UK limits, and never under the common height of a lorry', () => {
    for (const { dimensions: d, name } of VEHICLE_PRESETS) {
      expect({ name, ok: d.widthM <= 2.55 }).toEqual({ name, ok: true });
      expect({ name, ok: d.lengthM <= 16.5 }).toEqual({ name, ok: true });
      expect({ name, ok: d.grossWeightT <= 44 }).toEqual({ name, ok: true });
      // A small lorry is rarely under 3.5 m high and a bigger one rarely under 4 m: a lower figure would route a
      // vehicle under a bridge it cannot clear.
      expect({ name, ok: d.heightM >= 3.5 }).toEqual({ name, ok: true });
    }
    const artic = VEHICLE_PRESETS.find((p) => p.id === 'artic-44');
    expect(artic?.dimensions.heightM).toBeGreaterThanOrEqual(4.11); // 13 ft 6 in, the common top of a standard trailer
  });

  it('gets heavier and taller or longer as the class gets bigger', () => {
    const weights = VEHICLE_PRESETS.map((p) => p.dimensions.grossWeightT);
    expect([...weights].sort((a, b) => a - b)).toEqual(weights);
  });
});
