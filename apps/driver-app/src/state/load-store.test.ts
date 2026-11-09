import * as SecureStore from 'expo-secure-store';

import { useLoadStore } from './load-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useLoadStore.setState({ loaded: false });
});

it('is Empty until the driver chooses Loaded', () => {
  expect(useLoadStore.getState().loaded).toBe(false);
});

it('remembers the choice on the phone', async () => {
  await useLoadStore.getState().setLoaded(true);
  expect(useLoadStore.getState().loaded).toBe(true);
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.loaded', 'loaded');
  await useLoadStore.getState().setLoaded(false);
  expect(setItemAsync).toHaveBeenLastCalledWith('wagonwise.loaded', 'empty');
});

it('restores Loaded, and ignores anything else or an unreadable store', async () => {
  getItemAsync.mockResolvedValue('loaded');
  await useLoadStore.getState().restore();
  expect(useLoadStore.getState().loaded).toBe(true);

  useLoadStore.setState({ loaded: false });
  getItemAsync.mockResolvedValue('nonsense');
  await useLoadStore.getState().restore();
  expect(useLoadStore.getState().loaded).toBe(false);

  getItemAsync.mockRejectedValue(new Error('locked'));
  await useLoadStore.getState().restore();
  expect(useLoadStore.getState().loaded).toBe(false);
});

it('keeps the choice for the session when it cannot be saved', async () => {
  setItemAsync.mockRejectedValue(new Error('full'));
  await useLoadStore.getState().setLoaded(true);
  expect(useLoadStore.getState().loaded).toBe(true);
});
