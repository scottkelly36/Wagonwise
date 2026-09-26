import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken } from '../api/identity';
import { useAuthStore, type DriverInfo } from './auth-store';

// Hoisted above these imports by babel-plugin-jest-hoist regardless of textual position —
// written after the imports only so eslint's import/first rule stays happy.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('../api/identity', () => ({
  refreshAccessToken: jest.fn(),
}));

const getItemAsync = jest.mocked(SecureStore.getItemAsync);
const setItemAsync = jest.mocked(SecureStore.setItemAsync);
const deleteItemAsync = jest.mocked(SecureStore.deleteItemAsync);
const refreshAccessTokenMock = jest.mocked(refreshAccessToken);

const driver: DriverInfo = {
  id: 'driver-1',
  identifier: 'driver@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
  isAdmin: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ state: { status: 'restoring' } });
});

describe('restore', () => {
  it('goes straight to signedOut when nothing is stored', async () => {
    getItemAsync.mockResolvedValue(null);

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().state).toEqual({ status: 'signedOut' });
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it('exchanges a stored refresh token for a fresh access token and rotates it in storage', async () => {
    getItemAsync.mockImplementation((key) =>
      Promise.resolve(key === 'wagonwise.refreshToken' ? 'stored-refresh' : JSON.stringify(driver)),
    );
    refreshAccessTokenMock.mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'rotated-refresh',
    });

    await useAuthStore.getState().restore();

    expect(refreshAccessTokenMock).toHaveBeenCalledWith('stored-refresh');
    expect(setItemAsync).toHaveBeenCalledWith('wagonwise.refreshToken', 'rotated-refresh');
    expect(useAuthStore.getState().state).toEqual({
      status: 'signedIn',
      accessToken: 'fresh-access',
      refreshToken: 'rotated-refresh',
      driver,
    });
  });

  it('clears storage and signs out when the stored refresh token is dead', async () => {
    getItemAsync.mockImplementation((key) =>
      Promise.resolve(key === 'wagonwise.refreshToken' ? 'stale-refresh' : JSON.stringify(driver)),
    );
    refreshAccessTokenMock.mockRejectedValue(new Error('RefreshTokenReused'));

    await useAuthStore.getState().restore();

    expect(deleteItemAsync).toHaveBeenCalledWith('wagonwise.refreshToken');
    expect(deleteItemAsync).toHaveBeenCalledWith('wagonwise.driver');
    expect(useAuthStore.getState().state).toEqual({ status: 'signedOut' });
  });
});

describe('signIn', () => {
  it('persists the refresh token and driver, and sets signedIn state', async () => {
    await useAuthStore
      .getState()
      .signIn({ accessToken: 'access-1', refreshToken: 'refresh-1' }, driver);

    expect(setItemAsync).toHaveBeenCalledWith('wagonwise.refreshToken', 'refresh-1');
    expect(setItemAsync).toHaveBeenCalledWith('wagonwise.driver', JSON.stringify(driver));
    expect(useAuthStore.getState().state).toEqual({
      status: 'signedIn',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      driver,
    });
  });
});

describe('signOut', () => {
  it('clears storage and goes back to signedOut', async () => {
    useAuthStore.setState({
      state: { status: 'signedIn', accessToken: 'a', refreshToken: 'r', driver },
    });

    await useAuthStore.getState().signOut();

    expect(deleteItemAsync).toHaveBeenCalledWith('wagonwise.refreshToken');
    expect(deleteItemAsync).toHaveBeenCalledWith('wagonwise.driver');
    expect(useAuthStore.getState().state).toEqual({ status: 'signedOut' });
  });
});

describe('setTokens', () => {
  it('rotates the persisted refresh token and updates state while signed in', async () => {
    useAuthStore.setState({
      state: { status: 'signedIn', accessToken: 'old-access', refreshToken: 'old-refresh', driver },
    });

    await useAuthStore.getState().setTokens('new-access', 'new-refresh');

    expect(setItemAsync).toHaveBeenCalledWith('wagonwise.refreshToken', 'new-refresh');
    expect(useAuthStore.getState().state).toEqual({
      status: 'signedIn',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      driver,
    });
  });

  it('is a no-op when not signed in — nothing to rotate', async () => {
    useAuthStore.setState({ state: { status: 'signedOut' } });

    await useAuthStore.getState().setTokens('new-access', 'new-refresh');

    expect(setItemAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState().state).toEqual({ status: 'signedOut' });
  });
});

describe('setDriver', () => {
  it('persists and updates the cached driver, leaving tokens untouched', async () => {
    useAuthStore.setState({
      state: { status: 'signedIn', accessToken: 'a', refreshToken: 'r', driver },
    });
    const consented = { ...driver, consentedAt: '2026-06-15T08:00:00.000Z' };

    await useAuthStore.getState().setDriver(consented);

    expect(setItemAsync).toHaveBeenCalledWith('wagonwise.driver', JSON.stringify(consented));
    expect(useAuthStore.getState().state).toEqual({
      status: 'signedIn',
      accessToken: 'a',
      refreshToken: 'r',
      driver: consented,
    });
  });

  it('is a no-op when not signed in', async () => {
    useAuthStore.setState({ state: { status: 'signedOut' } });

    await useAuthStore.getState().setDriver({ ...driver, consentedAt: 'x' });

    expect(setItemAsync).not.toHaveBeenCalled();
    expect(useAuthStore.getState().state).toEqual({ status: 'signedOut' });
  });
});
