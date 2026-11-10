import {
  dimensionWarnings,
  EMPTY_VEHICLE_PROFILE_FORM,
  parseVehicleProfileForm,
  vehicleProfileFormValuesFrom,
  type VehicleProfileFormValues,
} from './vehicle-profile-form';

const validValues: VehicleProfileFormValues = {
  name: 'Big rig',
  heightM: '4.2',
  widthM: '2.6',
  lengthM: '16.5',
  grossWeightT: '32',
  axleWeightT: '',
  topSpeedKph: '',
  fuelConsumptionL100km: '',
};

describe('top speed', () => {
  it('is left out of the dimensions when blank, so the usual 55 mph applies', () => {
    const result = parseVehicleProfileForm(validValues);
    expect(result.ok && result.value.dimensions.topSpeedKph).toBeUndefined();
  });

  it('is sent in km/h as part of the dimensions when given', () => {
    const result = parseVehicleProfileForm({ ...validValues, topSpeedKph: '90.1' });
    expect(result.ok && result.value.dimensions.topSpeedKph).toBe(90.1);
  });

  it('says what range is allowed in mph, not as a bad measurement', () => {
    const message = 'Top speed should be between 19 and 80 mph.';
    expect(parseVehicleProfileForm({ ...validValues, topSpeedKph: '10' })).toEqual({
      ok: false,
      message,
    });
    expect(parseVehicleProfileForm({ ...validValues, topSpeedKph: '200' })).toEqual({
      ok: false,
      message,
    });
    expect(parseVehicleProfileForm({ ...validValues, topSpeedKph: 'NaN' })).toEqual({
      ok: false,
      message,
    });
  });

  it('fills the edit form from a saved profile, and leaves it blank when there is none', () => {
    const dimensions = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
    expect(
      vehicleProfileFormValuesFrom({ name: 'Rig', dimensions: { ...dimensions, topSpeedKph: 90 } })
        .topSpeedKph,
    ).toBe('90');
    expect(vehicleProfileFormValuesFrom({ name: 'Rig', dimensions }).topSpeedKph).toBe('');
  });

  it('warns about a lorry over 7.5 tonnes set faster than its 56 mph limiter, but not a van, and never blocks', () => {
    const fast = { ...validValues, topSpeedKph: '113' };
    expect(dimensionWarnings(fast).topSpeedKph).toBeDefined();
    expect(dimensionWarnings({ ...fast, grossWeightT: '3.5' }).topSpeedKph).toBeUndefined();
    expect(dimensionWarnings({ ...validValues, topSpeedKph: '90' }).topSpeedKph).toBeUndefined();
    expect(parseVehicleProfileForm(fast).ok).toBe(true);
  });
});

describe('parseVehicleProfileForm', () => {
  it('parses valid values, omitting an unset optional axle weight', () => {
    const result = parseVehicleProfileForm(validValues);
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Big rig',
        dimensions: { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 },
      },
    });
  });

  it('includes a given axle weight', () => {
    const result = parseVehicleProfileForm({ ...validValues, axleWeightT: '10' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.dimensions.axleWeightT).toBe(10);
  });

  it('trims the name and rejects a blank one', () => {
    expect(parseVehicleProfileForm({ ...validValues, name: '  Rig  ' })).toEqual(
      expect.objectContaining({ ok: true, value: expect.objectContaining({ name: 'Rig' }) }),
    );
    expect(parseVehicleProfileForm({ ...validValues, name: '   ' })).toEqual({
      ok: false,
      message: 'Give this vehicle a name.',
    });
  });

  it('rejects a zero or negative measurement — mirrors the domain rule exactly', () => {
    expect(parseVehicleProfileForm({ ...validValues, heightM: '0' })).toEqual({
      ok: false,
      message: 'Every measurement must be a positive number.',
    });
    expect(parseVehicleProfileForm({ ...validValues, grossWeightT: '-5' })).toEqual({
      ok: false,
      message: 'Every measurement must be a positive number.',
    });
  });

  it('rejects unparseable (non-numeric) input rather than sending NaN', () => {
    expect(parseVehicleProfileForm({ ...validValues, widthM: 'abc' })).toEqual({
      ok: false,
      message: 'Every measurement must be a positive number.',
    });
  });

  it('rejects a non-positive axle weight when one is given', () => {
    expect(parseVehicleProfileForm({ ...validValues, axleWeightT: '0' })).toEqual({
      ok: false,
      message: 'Every measurement must be a positive number.',
    });
  });

  it('omits fuelConsumptionL100km when left blank', () => {
    const result = parseVehicleProfileForm(validValues);
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.fuelConsumptionL100km).toBeUndefined();
  });

  it('includes a given fuelConsumptionL100km', () => {
    const result = parseVehicleProfileForm({ ...validValues, fuelConsumptionL100km: '30' });
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.fuelConsumptionL100km).toBe(30);
  });

  it('rejects a non-positive fuelConsumptionL100km when one is given', () => {
    expect(parseVehicleProfileForm({ ...validValues, fuelConsumptionL100km: '0' })).toEqual({
      ok: false,
      message: 'Fuel consumption must be a positive number.',
    });
  });
});

describe('vehicleProfileFormValuesFrom', () => {
  it('formats a fetched profile back into editable strings', () => {
    const values = vehicleProfileFormValuesFrom({
      name: 'Big rig',
      dimensions: { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32, axleWeightT: 10 },
    });
    expect(values).toEqual({
      name: 'Big rig',
      heightM: '4.2',
      widthM: '2.6',
      lengthM: '16.5',
      grossWeightT: '32',
      axleWeightT: '10',
      topSpeedKph: '',
      fuelConsumptionL100km: '',
    });
  });

  it('leaves axleWeightT blank when the profile has none', () => {
    const values = vehicleProfileFormValuesFrom({
      name: 'Van',
      dimensions: { heightM: 2.2, widthM: 1.8, lengthM: 5, grossWeightT: 3.5 },
    });
    expect(values.axleWeightT).toBe('');
  });

  it('formats a given fuelConsumptionL100km, leaves it blank when unset', () => {
    const withConsumption = vehicleProfileFormValuesFrom({
      name: 'Big rig',
      dimensions: { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 },
      fuelConsumptionL100km: 30,
    });
    expect(withConsumption.fuelConsumptionL100km).toBe('30');

    const withoutConsumption = vehicleProfileFormValuesFrom({
      name: 'Van',
      dimensions: { heightM: 2.2, widthM: 1.8, lengthM: 5, grossWeightT: 3.5 },
    });
    expect(withoutConsumption.fuelConsumptionL100km).toBe('');
  });
});

describe('dimensionWarnings', () => {
  const ok = {
    ...EMPTY_VEHICLE_PROFILE_FORM,
    name: 'Artic',
    heightM: '4',
    widthM: '2.55',
    lengthM: '16.5',
    grossWeightT: '44',
    axleWeightT: '10.5',
  };

  it('says nothing about an ordinary UK artic, or about blank fields', () => {
    expect(dimensionWarnings(ok)).toEqual({});
    expect(dimensionWarnings(EMPTY_VEHICLE_PROFILE_FORM)).toEqual({});
  });

  it('allows a 2.6 m fridge body but warns about the 4 m width that sent a route down back roads', () => {
    expect(dimensionWarnings({ ...ok, widthM: '2.6' }).widthM).toBeUndefined();
    expect(dimensionWarnings({ ...ok, widthM: '4' }).widthM).toMatch(/2\.55 m/);
  });

  it('warns on height, length, weight and axle weight beyond normal UK maxima', () => {
    expect(dimensionWarnings({ ...ok, heightM: '5.5' }).heightM).toBeDefined();
    expect(dimensionWarnings({ ...ok, lengthM: '25' }).lengthM).toBeDefined();
    expect(dimensionWarnings({ ...ok, grossWeightT: '60' }).grossWeightT).toBeDefined();
    expect(dimensionWarnings({ ...ok, axleWeightT: '13' }).axleWeightT).toBeDefined();
  });

  it('does not warn at the limits themselves', () => {
    expect(
      dimensionWarnings({
        ...ok,
        heightM: '4.95',
        lengthM: '18.75',
        grossWeightT: '44',
        axleWeightT: '11.5',
      }),
    ).toEqual({});
  });

  it('ignores text that is not a number (the submit check handles that)', () => {
    expect(dimensionWarnings({ ...ok, widthM: 'abc' })).toEqual({});
  });
});
