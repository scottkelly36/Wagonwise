import { fireEvent, render, screen } from '@testing-library/react-native';

import { EMPTY_VEHICLE_PROFILE_FORM } from '../lib/vehicle-profile-form';
import { useLengthUnitStore } from '../state/length-unit-store';
import { VehicleProfileForm } from './vehicle-profile-form';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

beforeEach(() => {
  useLengthUnitStore.setState({ unit: 'metres' });
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
