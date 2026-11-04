import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking, Platform, Share } from 'react-native';

import MoreScreen from '../app/(tabs)/more';
import { useAuthStore } from '../state/auth-store';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: mockReplace }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('../api/use-sign-in-options', () => ({
  useSignInOptions: () => ({ data: { passwordSignIn: false } }),
}));
jest.mock('../api/use-identity', () => ({
  useDeleteAccount: () => ({ mutate: jest.fn(), isPending: false, isError: false }),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

const signOut = jest.fn(() => Promise.resolve());

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    state: {
      status: 'signedIn',
      accessToken: 'a',
      refreshToken: 'r',
      driver: { id: 'd1', identifier: '+447700900000', createdAt: '2026-11-01T00:00:00.000Z' },
    },
    signOut,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('More screen', () => {
  it('asks before signing out, and does nothing on Cancel', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<MoreScreen />);
    await fireEvent.press(screen.getByTestId('sign-out-button'));

    expect(signOut).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual(['Cancel', 'Sign out']);
    expect(buttons[0]?.onPress).toBeUndefined();
  });

  it('signs out and goes to the sign-in screen when the driver confirms', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await render(<MoreScreen />);
    await fireEvent.press(screen.getByTestId('sign-out-button'));

    alert.mock.calls[0]?.[2]?.[1]?.onPress?.();
    await Promise.resolve();
    expect(signOut).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });

  it('opens the share sheet with the Play link on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    await render(<MoreScreen />);
    await fireEvent.press(screen.getByTestId('share-app-button'));

    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0]?.[0].message).toContain('com.wagonwise.driverapp');
  });

  it('opens the Play Store listing to rate, and the web page when that fails', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const open = jest
      .spyOn(Linking, 'openURL')
      .mockRejectedValueOnce(new Error('no store'))
      .mockResolvedValue(undefined);
    await render(<MoreScreen />);
    await fireEvent.press(screen.getByTestId('rate-app-button'));

    expect(open).toHaveBeenCalledWith('market://details?id=com.wagonwise.driverapp');
    await Promise.resolve();
    await Promise.resolve();
    expect(open).toHaveBeenCalledWith(
      'https://play.google.com/store/apps/details?id=com.wagonwise.driverapp',
    );
  });

  it('has no Rate row on iOS, which has no listing yet', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(<MoreScreen />);
    expect(screen.queryByTestId('rate-app-button')).toBeNull();
    expect(screen.getByTestId('share-app-button')).toBeTruthy();
  });
});
