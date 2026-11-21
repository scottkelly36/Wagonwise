import * as SecureStore from 'expo-secure-store';
import { useGpsSpeedStore } from './gps-speed-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useGpsSpeedStore.setState({ enabled: true });
});

it('is on until the driver turns it off', () => {
  expect(useGpsSpeedStore.getState().enabled).toBe(true);
});

it('restores a saved choice, and ignores anything unrecognised or unreadable', async () => {
  getItemAsync.mockResolvedValue('false');
  await useGpsSpeedStore.getState().restore();
  expect(useGpsSpeedStore.getState().enabled).toBe(false);
  useGpsSpeedStore.setState({ enabled: true });
  getItemAsync.mockResolvedValue('maybe');
  await useGpsSpeedStore.getState().restore();
  expect(useGpsSpeedStore.getState().enabled).toBe(true);
  getItemAsync.mockRejectedValue(new Error('locked'));
  await useGpsSpeedStore.getState().restore();
  expect(useGpsSpeedStore.getState().enabled).toBe(true);
});

it('saves a new choice on the phone', async () => {
  await useGpsSpeedStore.getState().setEnabled(false);
  expect(useGpsSpeedStore.getState().enabled).toBe(false);
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.showGpsSpeed', 'false');
});

it('keeps the choice for this session when saving it fails', async () => {
  setItemAsync.mockRejectedValue(new Error('locked'));
  await useGpsSpeedStore.getState().setEnabled(false);
  expect(useGpsSpeedStore.getState().enabled).toBe(false);
});
