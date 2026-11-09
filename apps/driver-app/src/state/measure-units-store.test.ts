import * as SecureStore from 'expo-secure-store';
import { useMeasureUnitsStore } from './measure-units-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useMeasureUnitsStore.setState({ distance: 'km', fuel: 'l100km' });
});

it('is kilometres and L/100km until the driver chooses otherwise', () => {
  expect(useMeasureUnitsStore.getState().distance).toBe('km');
  expect(useMeasureUnitsStore.getState().fuel).toBe('l100km');
});

it('restores saved choices, and ignores anything unrecognised or unreadable', async () => {
  getItemAsync.mockImplementation(async (key) =>
    key === 'wagonwise.distanceUnit' ? 'miles' : 'mpg',
  );
  await useMeasureUnitsStore.getState().restore();
  expect(useMeasureUnitsStore.getState().distance).toBe('miles');
  expect(useMeasureUnitsStore.getState().fuel).toBe('mpg');

  useMeasureUnitsStore.setState({ distance: 'km', fuel: 'l100km' });
  getItemAsync.mockResolvedValue('furlongs');
  await useMeasureUnitsStore.getState().restore();
  expect(useMeasureUnitsStore.getState().distance).toBe('km');
  expect(useMeasureUnitsStore.getState().fuel).toBe('l100km');

  getItemAsync.mockRejectedValue(new Error('locked'));
  await useMeasureUnitsStore.getState().restore();
  expect(useMeasureUnitsStore.getState().distance).toBe('km');
});

it('saves each choice, and keeps it for the session even if saving fails', async () => {
  await useMeasureUnitsStore.getState().setDistance('miles');
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.distanceUnit', 'miles');
  await useMeasureUnitsStore.getState().setFuel('mpg');
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.fuelUnit', 'mpg');
  setItemAsync.mockRejectedValue(new Error('locked'));
  await useMeasureUnitsStore.getState().setDistance('km');
  expect(useMeasureUnitsStore.getState().distance).toBe('km');
});
