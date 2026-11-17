import * as SecureStore from 'expo-secure-store';

import { useUsualVehicleStore } from './usual-vehicle-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);
const deleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useUsualVehicleStore.setState({ profileId: undefined });
});

it('has no usual lorry until one is set, then remembers it on the phone', async () => {
  expect(useUsualVehicleStore.getState().profileId).toBeUndefined();
  await useUsualVehicleStore.getState().setUsual('p1');
  expect(useUsualVehicleStore.getState().profileId).toBe('p1');
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.usualVehicle', 'p1');
});

it('forgets it when cleared', async () => {
  await useUsualVehicleStore.getState().setUsual('p1');
  await useUsualVehicleStore.getState().setUsual(undefined);
  expect(useUsualVehicleStore.getState().profileId).toBeUndefined();
  expect(deleteItemAsync).toHaveBeenCalledWith('wagonwise.usualVehicle');
});

it('restores a saved id, and stays empty when there is none or the store cannot be read', async () => {
  getItemAsync.mockResolvedValue('p2');
  await useUsualVehicleStore.getState().restore();
  expect(useUsualVehicleStore.getState().profileId).toBe('p2');

  useUsualVehicleStore.setState({ profileId: undefined });
  getItemAsync.mockResolvedValue(null);
  await useUsualVehicleStore.getState().restore();
  expect(useUsualVehicleStore.getState().profileId).toBeUndefined();

  getItemAsync.mockRejectedValue(new Error('locked'));
  await useUsualVehicleStore.getState().restore();
  expect(useUsualVehicleStore.getState().profileId).toBeUndefined();
});
