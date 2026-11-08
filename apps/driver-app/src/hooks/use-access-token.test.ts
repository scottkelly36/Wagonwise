import { act, renderHook } from '@testing-library/react-native';

import { useAuthStore } from '../state/auth-store';
import { useAccessToken } from './use-access-token';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const driver = { id: 'd1', identifier: 'a@example.com', createdAt: '2026-11-01T00:00:00.000Z' };

describe('useAccessToken', () => {
  it('gives the access token while signed in', async () => {
    useAuthStore.setState({
      state: { status: 'signedIn', accessToken: 'tok', refreshToken: 'ref', driver },
    });
    const { result } = await renderHook(() => useAccessToken());
    expect(result.current).toBe('tok');
  });

  it('gives an empty token, and does not throw, the moment the driver signs out with a screen still mounted', async () => {
    useAuthStore.setState({
      state: { status: 'signedIn', accessToken: 'tok', refreshToken: 'ref', driver },
    });
    const { result } = await renderHook(() => useAccessToken());
    await act(async () => {
      await useAuthStore.getState().signOut();
    });
    expect(result.current).toBe('');
  });

  it('still fails loudly before the sign-in has been restored, which no signed-in screen should reach', async () => {
    useAuthStore.setState({ state: { status: 'restoring' } });
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(renderHook(() => useAccessToken())).rejects.toThrow(/not signed in/);
    spy.mockRestore();
  });
});
