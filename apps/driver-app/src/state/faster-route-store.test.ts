import * as SecureStore from 'expo-secure-store';
import { useFasterRouteStore } from './faster-route-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useFasterRouteStore.setState({ enabled: true, keptByTrip: {} });
});

it('is on until the driver turns it off', () => {
  expect(useFasterRouteStore.getState().enabled).toBe(true);
});

it('restores a saved choice, and ignores anything unrecognised or unreadable', async () => {
  getItemAsync.mockResolvedValue('false');
  await useFasterRouteStore.getState().restore();
  expect(useFasterRouteStore.getState().enabled).toBe(false);
  useFasterRouteStore.setState({ enabled: true });
  getItemAsync.mockResolvedValue('maybe');
  await useFasterRouteStore.getState().restore();
  expect(useFasterRouteStore.getState().enabled).toBe(true);
  getItemAsync.mockRejectedValue(new Error('locked'));
  await useFasterRouteStore.getState().restore();
  expect(useFasterRouteStore.getState().enabled).toBe(true);
});

it('saves a new choice on the phone', async () => {
  await useFasterRouteStore.getState().setEnabled(false);
  expect(useFasterRouteStore.getState().enabled).toBe(false);
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.fasterRouteSuggestions', 'false');
});

it('remembers kept routes per trip', () => {
  const { keep } = useFasterRouteStore.getState();
  keep('trip-1', 'aaaa1111');
  keep('trip-1', 'bbbb2222');
  keep('trip-2', 'cccc3333');
  expect(useFasterRouteStore.getState().keptByTrip).toEqual({
    'trip-1': ['aaaa1111', 'bbbb2222'],
    'trip-2': ['cccc3333'],
  });
});
