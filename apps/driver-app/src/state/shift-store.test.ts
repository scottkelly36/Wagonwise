import * as SecureStore from 'expo-secure-store';
import { useShiftStore } from './shift-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useShiftStore.setState({ log: [], rules: 'assimilated_eu', extensionsLeft: 0 });
});

it('records what the driver does and saves it on the phone', async () => {
  await useShiftStore.getState().record('driving', 1000);
  await useShiftStore.getState().record('break', 5000);
  expect(useShiftStore.getState().log).toEqual([
    { kind: 'driving', start: 1000, end: 5000 },
    { kind: 'break', start: 5000 },
  ]);
  expect(setItemAsync).toHaveBeenLastCalledWith(
    'wagonwise.shift',
    expect.stringContaining('break'),
  );
});

it('restores a saved shift, and ignores a damaged one', async () => {
  getItemAsync.mockResolvedValue(
    JSON.stringify({
      log: [{ kind: 'driving', start: 1 }],
      rules: 'gb_domestic',
      extensionsLeft: 9,
    }),
  );
  await useShiftStore.getState().restore();
  expect(useShiftStore.getState()).toMatchObject({ rules: 'gb_domestic', extensionsLeft: 2 });
  expect(useShiftStore.getState().log).toHaveLength(1);

  getItemAsync.mockResolvedValue('{not json');
  await useShiftStore.getState().restore();
  expect(useShiftStore.getState().rules).toBe('gb_domestic');
});

it('clears everything', async () => {
  await useShiftStore.getState().record('driving', 1000);
  await useShiftStore.getState().clear();
  expect(useShiftStore.getState().log).toEqual([]);
});
