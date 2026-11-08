import * as SecureStore from 'expo-secure-store';
import { useLengthUnitStore } from './length-unit-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useLengthUnitStore.setState({ unit: 'metres' });
});

it('is metres until the driver chooses feet and inches', () => {
  expect(useLengthUnitStore.getState().unit).toBe('metres');
});

it('restores a saved choice, and ignores anything unrecognised or unreadable', async () => {
  getItemAsync.mockResolvedValue('feet');
  await useLengthUnitStore.getState().restore();
  expect(useLengthUnitStore.getState().unit).toBe('feet');
  useLengthUnitStore.setState({ unit: 'metres' });
  getItemAsync.mockResolvedValue('furlongs');
  await useLengthUnitStore.getState().restore();
  expect(useLengthUnitStore.getState().unit).toBe('metres');
  getItemAsync.mockRejectedValue(new Error('locked'));
  await useLengthUnitStore.getState().restore();
  expect(useLengthUnitStore.getState().unit).toBe('metres');
});

it('saves the choice, and keeps it for the session even if saving fails', async () => {
  await useLengthUnitStore.getState().setUnit('feet');
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.lengthUnit', 'feet');
  setItemAsync.mockRejectedValue(new Error('locked'));
  await useLengthUnitStore.getState().setUnit('metres');
  expect(useLengthUnitStore.getState().unit).toBe('metres');
});
