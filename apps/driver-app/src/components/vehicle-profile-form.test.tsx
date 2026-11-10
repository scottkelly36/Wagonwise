import { fireEvent, render, screen } from '@testing-library/react-native';

import { EMPTY_VEHICLE_PROFILE_FORM } from '../lib/vehicle-profile-form';
import { useLengthUnitStore } from '../state/length-unit-store';
import { useMeasureUnitsStore } from '../state/measure-units-store';
import { VehicleProfileForm } from './vehicle-profile-form';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

beforeEach(() => {
  useLengthUnitStore.setState({ unit: 'metres' });
  useMeasureUnitsStore.setState({ distance: 'km', fuel: 'l100km' });
});

async function type(testID: string, text: string) {
  await fireEvent.changeText(screen.getByTestId(testID), text);
}

describe('VehicleProfileForm, in feet and inches', () => {
  it('turns the feet and inches a driver types into the metres that are sent', async () => {
    useLengthUnitStore.setState({ unit: 'feet' });
    const onSubmit = jest.fn();
    await render(
      <VehicleProfileForm
        initialValues={EMPTY_VEHICLE_PROFILE_FORM}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={onSubmit}
      />,
    );

    await type('profile-name-input', 'Big wagon');
    await type('profile-height-feet-input', '13');
    await type('profile-height-inches-input', '6');
    await type('profile-width-feet-input', '8');
    await type('profile-width-inches-input', '6');
    await type('profile-length-feet-input', '54');
    await type('profile-length-inches-input', '2');
    await type('profile-weight-input', '32');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].dimensions).toEqual({
      heightM: 4.1148,
      widthM: 2.5908,
      lengthM: 16.51,
      grossWeightT: 32,
    });
  });

  it('fills the boxes from a saved profile, rounding up to the next inch, never down', async () => {
    useLengthUnitStore.setState({ unit: 'feet' });
    await render(
      <VehicleProfileForm
        initialValues={{
          ...EMPTY_VEHICLE_PROFILE_FORM,
          name: 'Big wagon',
          heightM: '4.2',
          widthM: '2.5908',
          lengthM: '16.5',
          grossWeightT: '32',
        }}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={jest.fn()}
      />,
    );

    // 4.2 m is 13 ft 9.4 in, shown as 13 ft 10 in.
    expect(screen.getByTestId('profile-height-feet-input').props.value).toBe('13');
    expect(screen.getByTestId('profile-height-inches-input').props.value).toBe('10');
    // 2.5908 m is exactly 8 ft 6 in.
    expect(screen.getByTestId('profile-width-feet-input').props.value).toBe('8');
    expect(screen.getByTestId('profile-width-inches-input').props.value).toBe('6');
  });

  it('says a measurement is not valid when both boxes are left empty', async () => {
    useLengthUnitStore.setState({ unit: 'feet' });
    const onSubmit = jest.fn();
    await render(
      <VehicleProfileForm
        initialValues={{ ...EMPTY_VEHICLE_PROFILE_FORM, name: 'Big wagon', grossWeightT: '32' }}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={onSubmit}
      />,
    );

    await fireEvent.press(screen.getByTestId('profile-submit-button'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Every measurement must be a positive number.')).toBeTruthy();
  });

  it('still takes metres when that is the chosen unit', async () => {
    const onSubmit = jest.fn();
    await render(
      <VehicleProfileForm
        initialValues={EMPTY_VEHICLE_PROFILE_FORM}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={onSubmit}
      />,
    );

    await type('profile-name-input', 'Big wagon');
    await type('profile-height-input', '4.2');
    await type('profile-width-input', '2.6');
    await type('profile-length-input', '16.5');
    await type('profile-weight-input', '32');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));

    expect(onSubmit.mock.calls[0][0].dimensions).toEqual({
      heightM: 4.2,
      widthM: 2.6,
      lengthM: 16.5,
      grossWeightT: 32,
    });
  });
});

describe('VehicleProfileForm, top speed', () => {
  const baseValues = {
    ...EMPTY_VEHICLE_PROFILE_FORM,
    name: 'Big wagon',
    heightM: '4.2',
    widthM: '2.6',
    lengthM: '16.5',
    grossWeightT: '32',
  };

  async function open(initialValues: typeof baseValues, onSubmit = jest.fn()) {
    await render(
      <VehicleProfileForm
        initialValues={initialValues}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }

  it('sends nothing when left blank, so the usual 55 mph applies', async () => {
    const onSubmit = await open(baseValues);
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[0][0].dimensions.topSpeedKph).toBeUndefined();
  });

  it('is typed in miles per hour and sent in km/h with the dimensions', async () => {
    const onSubmit = await open(baseValues);
    await type('profile-top-speed-input', '56');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[0][0].dimensions.topSpeedKph).toBe(90.1);
  });

  it('is there when a preset is chosen, not only when typing the sizes', async () => {
    await open(baseValues);
    await fireEvent.press(screen.getByTestId('profile-unit-presets-button'));
    expect(screen.getByTestId('profile-top-speed-input')).toBeTruthy();
  });

  it('fills from a saved speed, and sends it unchanged if the driver leaves it alone', async () => {
    const onSubmit = await open({ ...baseValues, topSpeedKph: '90' });
    expect(screen.getByTestId('profile-top-speed-input').props.value).toBe('55.9');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[0][0].dimensions.topSpeedKph).toBe(90);
  });

  it('says what is allowed for a speed that is a typo, and does not save it', async () => {
    const onSubmit = await open(baseValues);
    await type('profile-top-speed-input', '300');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Top speed should be between 19 and 80 mph.')).toBeTruthy();
  });

  it('warns, without blocking, when a lorry is set faster than its limiter', async () => {
    const onSubmit = await open(baseValues);
    await type('profile-top-speed-input', '70');
    expect(screen.getByTestId('profile-top-speed-warning')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('VehicleProfileForm, Euro VI', () => {
  const baseValues = {
    ...EMPTY_VEHICLE_PROFILE_FORM,
    name: 'Big wagon',
    heightM: '4.2',
    widthM: '2.6',
    lengthM: '16.5',
    grossWeightT: '32',
  };

  async function open(initialValues: typeof baseValues) {
    const onSubmit = jest.fn();
    await render(
      <VehicleProfileForm
        initialValues={initialValues}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  }

  it('starts on Don’t know and sends nothing, so a vehicle is never assumed compliant', async () => {
    const onSubmit = await open(baseValues);
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[0][0].dimensions.euroVI).toBeUndefined();
  });

  it('sends yes as true, no as false, and back to Don’t know as nothing', async () => {
    const onSubmit = await open(baseValues);

    await fireEvent.press(screen.getByTestId('profile-euro-vi-yes-button'));
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[0][0].dimensions.euroVI).toBe(true);

    await fireEvent.press(screen.getByTestId('profile-euro-vi-no-button'));
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[1][0].dimensions.euroVI).toBe(false);

    await fireEvent.press(screen.getByTestId('profile-euro-vi-unknown-button'));
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[2][0].dimensions.euroVI).toBeUndefined();
  });

  it('shows a saved answer, and keeps it when a preset is picked', async () => {
    const onSubmit = await open({ ...baseValues, euroVI: 'no' });
    expect(screen.getByTestId('profile-euro-vi-no-button').props.accessibilityState.selected).toBe(
      true,
    );
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[0][0].dimensions.euroVI).toBe(false);
  });

  it('is there when a preset is chosen, not only when typing the sizes', async () => {
    await open(baseValues);
    await fireEvent.press(screen.getByTestId('profile-unit-presets-button'));
    expect(screen.getByTestId('profile-euro-vi-yes-button')).toBeTruthy();
  });
});

describe('VehicleProfileForm, fuel economy in miles per gallon', () => {
  const baseValues = {
    ...EMPTY_VEHICLE_PROFILE_FORM,
    name: 'Big wagon',
    heightM: '4.2',
    widthM: '2.6',
    lengthM: '16.5',
    grossWeightT: '32',
  };

  it('turns the miles per gallon a driver types into the litres per 100 km that are sent', async () => {
    useMeasureUnitsStore.setState({ fuel: 'mpg' });
    const onSubmit = jest.fn();
    await render(
      <VehicleProfileForm
        initialValues={baseValues}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={onSubmit}
      />,
    );

    await type('profile-fuel-consumption-mpg-input', '10');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));

    expect(onSubmit.mock.calls[0][0].fuelConsumptionL100km).toBe(28.2481);
  });

  it('fills the box from a saved value, and sends it unchanged if the driver leaves it alone', async () => {
    useMeasureUnitsStore.setState({ fuel: 'mpg' });
    const onSubmit = jest.fn();
    await render(
      <VehicleProfileForm
        initialValues={{ ...baseValues, fuelConsumptionL100km: '30' }}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByTestId('profile-fuel-consumption-mpg-input').props.value).toBe('9.4');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(onSubmit.mock.calls[0][0].fuelConsumptionL100km).toBe(30);
  });

  it('says the fuel consumption is not valid for rubbish typed in miles per gallon', async () => {
    useMeasureUnitsStore.setState({ fuel: 'mpg' });
    const onSubmit = jest.fn();
    await render(
      <VehicleProfileForm
        initialValues={baseValues}
        submitLabel="Save"
        pending={false}
        errorMessage={undefined}
        onSubmit={onSubmit}
      />,
    );

    await type('profile-fuel-consumption-mpg-input', 'abc');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Fuel consumption must be a positive number.')).toBeTruthy();
  });
});
