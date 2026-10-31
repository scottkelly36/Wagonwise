import * as SecureStore from 'expo-secure-store';
import { useFuelChoiceStore } from './fuel-choice-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useFuelChoiceStore.setState({ choice: 'diesel' });
});

it('is diesel until the driver picks petrol', () => {
  expect(useFuelChoiceStore.getState().choice).toBe('diesel');
});

it('restores a saved choice, and ignores anything unrecognised or unreadable', async () => {
  getItemAsync.mockResolvedValue('petrol');
  await useFuelChoiceStore.getState().restore();
  expect(useFuelChoiceStore.getState().choice).toBe('petrol');
  useFuelChoiceStore.setState({ choice: 'diesel' });
  getItemAsync.mockResolvedValue('gas');
  await useFuelChoiceStore.getState().restore();
  expect(useFuelChoiceStore.getState().choice).toBe('diesel');
  getItemAsync.mockRejectedValue(new Error('locked'));
  await useFuelChoiceStore.getState().restore();
  expect(useFuelChoiceStore.getState().choice).toBe('diesel');
});

it('saves a new choice on the phone', async () => {
  await useFuelChoiceStore.getState().setChoice('petrol');
  expect(useFuelChoiceStore.getState().choice).toBe('petrol');
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.fuelChoice', 'petrol');
});
