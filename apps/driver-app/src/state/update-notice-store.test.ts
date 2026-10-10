import * as SecureStore from 'expo-secure-store';
import { useUpdateNoticeStore } from './update-notice-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useUpdateNoticeStore.setState({ dismissedVersion: undefined });
});

it('remembers which build the driver said not now to', async () => {
  await useUpdateNoticeStore.getState().dismiss('1.3.0');
  expect(useUpdateNoticeStore.getState().dismissedVersion).toBe('1.3.0');
  expect(setItemAsync).toHaveBeenCalledWith('wagonwise.dismissed-build', '1.3.0');
});

it('restores it, and copes with nothing saved or a failed read', async () => {
  getItemAsync.mockResolvedValue('1.3.0');
  await useUpdateNoticeStore.getState().restore();
  expect(useUpdateNoticeStore.getState().dismissedVersion).toBe('1.3.0');
  getItemAsync.mockResolvedValue(null);
  await useUpdateNoticeStore.getState().restore();
  expect(useUpdateNoticeStore.getState().dismissedVersion).toBeUndefined();
  getItemAsync.mockRejectedValue(new Error('locked'));
  await expect(useUpdateNoticeStore.getState().restore()).resolves.toBeUndefined();
});
