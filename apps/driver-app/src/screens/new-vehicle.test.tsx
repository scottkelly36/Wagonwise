import { fireEvent, render, screen } from '@testing-library/react-native';

import NewVehicleProfileScreen from '../app/profiles/new';
import { useLengthUnitStore } from '../state/length-unit-store';
import { useMeasureUnitsStore } from '../state/measure-units-store';

const mockBack = jest.fn();
const mockMutate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
jest.mock('../api/use-vehicle-profiles', () => ({
  useCreateVehicleProfile: () => ({ mutate: mockMutate, isPending: false, isError: false }),
}));

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  useLengthUnitStore.setState({ unit: 'metres' });
  useMeasureUnitsStore.setState({ distance: 'km', fuel: 'l100km' });
});

const value = (testID: string) => screen.getByTestId(testID).props.value;
const press = (testID: string) => fireEvent.press(screen.getByTestId(testID));

describe('Add a vehicle', () => {
  it('opens on the presets, with a switch offering Presets, Metres and Feet and inches', async () => {
    await render(<NewVehicleProfileScreen />);
    expect(screen.getByTestId('vehicle-preset-picker')).toBeTruthy();
    for (const key of ['presets', 'metres', 'feet']) {
      expect(screen.getByTestId(`profile-unit-${key}-button`)).toBeTruthy();
    }
    expect(
      screen.getByTestId('profile-unit-presets-button').props.accessibilityState,
    ).toMatchObject({ selected: true });
    // The typed boxes are not there until a driver chooses a unit.
    expect(screen.queryByTestId('profile-height-input')).toBeNull();
  });

  it('names the vehicle after the preset, and saves the preset figures as shown on its card', async () => {
    await render(<NewVehicleProfileScreen />);
    await press('vehicle-preset-artic-44');
    expect(value('profile-name-input')).toBe('Artic, 44 tonnes');
    expect(mockMutate).not.toHaveBeenCalled();
    await press('profile-submit-button');
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({
      name: 'Artic, 44 tonnes',
      dimensions: { heightM: 4.2, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 },
    });
  });

  it('keeps the figures when the driver switches to Metres, and a changed height is what is saved', async () => {
    await render(<NewVehicleProfileScreen />);
    await press('vehicle-preset-artic-44');
    await press('profile-unit-metres-button');
    expect(value('profile-height-input')).toBe('4.2');
    expect(value('profile-width-input')).toBe('2.55');
    expect(value('profile-length-input')).toBe('16.5');
    expect(value('profile-weight-input')).toBe('44');
    await fireEvent.changeText(screen.getByTestId('profile-height-input'), '4.5');
    await press('profile-submit-button');
    expect(mockMutate.mock.calls[0][0].dimensions).toEqual({
      heightM: 4.5,
      widthM: 2.55,
      lengthM: 16.5,
      grossWeightT: 44,
    });
  });

  it('shows a changed vehicle as "your own sizes" when the driver goes back to the presets', async () => {
    await render(<NewVehicleProfileScreen />);
    await press('vehicle-preset-artic-44');
    await press('profile-unit-metres-button');
    await fireEvent.changeText(screen.getByTestId('profile-height-input'), '4.5');
    await press('profile-unit-presets-button');
    expect(screen.getByTestId('profile-own-sizes-note')).toBeTruthy();
    expect(screen.getByTestId('vehicle-preset-artic-44').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('switching to another preset replaces the figures and the name', async () => {
    await render(<NewVehicleProfileScreen />);
    await press('vehicle-preset-artic-44');
    await press('vehicle-preset-rigid-18');
    expect(value('profile-name-input')).toBe('18 tonne rigid');
    await press('profile-submit-button');
    expect(mockMutate.mock.calls[0][0].dimensions.grossWeightT).toBe(18);
  });

  it('keeps a name the driver typed themselves when they pick a preset', async () => {
    await render(<NewVehicleProfileScreen />);
    await fireEvent.changeText(screen.getByTestId('profile-name-input'), 'My wagon');
    await press('vehicle-preset-rigid-26');
    expect(value('profile-name-input')).toBe('My wagon');
  });

  it('says what to do when Add is pressed before anything is picked', async () => {
    await render(<NewVehicleProfileScreen />);
    await press('profile-submit-button');
    expect(screen.getByText(/Pick the nearest match, or switch to Metres/)).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('still lets a driver type their own vehicle without a preset', async () => {
    await render(<NewVehicleProfileScreen />);
    await press('profile-unit-metres-button');
    await fireEvent.changeText(screen.getByTestId('profile-name-input'), 'My wagon');
    await fireEvent.changeText(screen.getByTestId('profile-height-input'), '4.9');
    await fireEvent.changeText(screen.getByTestId('profile-width-input'), '2.55');
    await fireEvent.changeText(screen.getByTestId('profile-length-input'), '16.5');
    await fireEvent.changeText(screen.getByTestId('profile-weight-input'), '44');
    await press('profile-submit-button');
    expect(mockMutate.mock.calls[0][0].name).toBe('My wagon');
  });
});
