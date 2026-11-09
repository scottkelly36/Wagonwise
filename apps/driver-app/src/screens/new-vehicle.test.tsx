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

describe('Add a vehicle', () => {
  it('starts with an empty form and the presets to pick from', async () => {
    await render(<NewVehicleProfileScreen />);
    expect(screen.getByTestId('vehicle-preset-picker')).toBeTruthy();
    expect(value('profile-name-input')).toBe('');
    expect(value('profile-height-input')).toBe('');
  });

  it('fills the form with the preset figures, which the driver sees before pressing Add', async () => {
    await render(<NewVehicleProfileScreen />);
    await fireEvent.press(screen.getByTestId('vehicle-preset-artic-44'));
    expect(value('profile-name-input')).toBe('Artic, 44 tonnes');
    expect(value('profile-height-input')).toBe('4.2');
    expect(value('profile-width-input')).toBe('2.55');
    expect(value('profile-length-input')).toBe('16.5');
    expect(value('profile-weight-input')).toBe('44');
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('saves the preset as shown, and a changed height is what is saved', async () => {
    await render(<NewVehicleProfileScreen />);
    await fireEvent.press(screen.getByTestId('vehicle-preset-artic-44'));
    await fireEvent.changeText(screen.getByTestId('profile-height-input'), '4.5');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({
      name: 'Artic, 44 tonnes',
      dimensions: { heightM: 4.5, widthM: 2.55, lengthM: 16.5, grossWeightT: 44 },
    });
  });

  it('switching to another preset replaces the figures', async () => {
    await render(<NewVehicleProfileScreen />);
    await fireEvent.press(screen.getByTestId('vehicle-preset-artic-44'));
    await fireEvent.press(screen.getByTestId('vehicle-preset-rigid-18'));
    expect(value('profile-name-input')).toBe('18 tonne rigid');
    expect(value('profile-weight-input')).toBe('18');
  });

  it('still lets a driver type their own vehicle without picking a preset', async () => {
    await render(<NewVehicleProfileScreen />);
    await fireEvent.changeText(screen.getByTestId('profile-name-input'), 'My wagon');
    await fireEvent.changeText(screen.getByTestId('profile-height-input'), '4.9');
    await fireEvent.changeText(screen.getByTestId('profile-width-input'), '2.55');
    await fireEvent.changeText(screen.getByTestId('profile-length-input'), '16.5');
    await fireEvent.changeText(screen.getByTestId('profile-weight-input'), '44');
    await fireEvent.press(screen.getByTestId('profile-submit-button'));
    expect(mockMutate.mock.calls[0][0].name).toBe('My wagon');
  });
});
