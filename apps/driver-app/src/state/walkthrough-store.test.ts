import * as SecureStore from 'expo-secure-store';
import { useWalkthroughStore } from './walkthrough-store';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  jest.clearAllMocks();
  useWalkthroughStore.setState({ status: 'restoring' });
});

describe('walkthrough store', () => {
  it('waits until the phone has been asked', () => {
    expect(useWalkthroughStore.getState().status).toBe('restoring');
  });

  it('is unseen on a phone with nothing saved, and seen once saved', async () => {
    getItemAsync.mockResolvedValue(null);
    await useWalkthroughStore.getState().restore();
    expect(useWalkthroughStore.getState().status).toBe('unseen');

    getItemAsync.mockResolvedValue('true');
    await useWalkthroughStore.getState().restore();
    expect(useWalkthroughStore.getState().status).toBe('seen');
  });

  it('does not nag when the saved value cannot be read', async () => {
    getItemAsync.mockRejectedValue(new Error('locked'));
    await useWalkthroughStore.getState().restore();
    expect(useWalkthroughStore.getState().status).toBe('seen');
  });

  it('remembers when the tour was finished, even if saving fails', async () => {
    await useWalkthroughStore.getState().markSeen();
    expect(useWalkthroughStore.getState().status).toBe('seen');
    expect(setItemAsync).toHaveBeenCalledWith('wagonwise.walkthroughSeen', 'true');

    setItemAsync.mockRejectedValue(new Error('full'));
    useWalkthroughStore.setState({ status: 'unseen' });
    await expect(useWalkthroughStore.getState().markSeen()).resolves.toBeUndefined();
    expect(useWalkthroughStore.getState().status).toBe('seen');
  });
});
