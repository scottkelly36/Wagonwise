import * as SecureStore from 'expo-secure-store';
import { useHoursStartStore } from './hours-start-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useHoursStartStore.setState({ preference: 'ask', restored: false });
});

it('asks until the saved choice has been read', () => {
  expect(useHoursStartStore.getState()).toMatchObject({ preference: 'ask', restored: false });
});

it('restores a saved choice', async () => {
  getItemAsync.mockResolvedValue('always');
  await useHoursStartStore.getState().restore();
  expect(useHoursStartStore.getState()).toMatchObject({ preference: 'always', restored: true });
});

it('asks when nothing is saved, the saved value is not recognised, or reading fails', async () => {
  getItemAsync.mockResolvedValue(null);
  await useHoursStartStore.getState().restore();
  expect(useHoursStartStore.getState().preference).toBe('ask');
  getItemAsync.mockResolvedValue('whenever');
  await useHoursStartStore.getState().restore();
  expect(useHoursStartStore.getState().preference).toBe('ask');
  getItemAsync.mockRejectedValue(new Error('locked'));
  await useHoursStartStore.getState().restore();
  expect(useHoursStartStore.getState()).toMatchObject({ preference: 'ask', restored: true });
});

it('saves a new choice on the phone', async () => {
  await useHoursStartStore.getState().setPreference('never');
  expect(useHoursStartStore.getState().preference).toBe('never');
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.hours-start', 'never');
});
