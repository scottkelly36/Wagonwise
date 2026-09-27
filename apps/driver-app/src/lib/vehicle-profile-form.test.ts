import {
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
  fuelConsumptionL100km: '',
};

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
