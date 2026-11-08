import { act, render } from '@testing-library/react-native';

import { useAuthStore } from '../state/auth-store';
import { SignOutRedirect } from './sign-out-redirect';

const mockReplace = jest.fn();
let mockPathname = '/home';
jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => mockPathname,
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.setTimeout(30_000);

const driver = { id: 'd1', identifier: 'a@example.com', createdAt: '2026-11-01T00:00:00.000Z' };
const signedIn = { status: 'signedIn', accessToken: 't', refreshToken: 'r', driver } as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/home';
});

describe('SignOutRedirect', () => {
  it('sends a driver who becomes signed out to the sign-in screen, wherever they are', async () => {
    useAuthStore.setState({ state: signedIn });
    await render(<SignOutRedirect />);
    expect(mockReplace).not.toHaveBeenCalled();
    await act(async () => {
      await useAuthStore.getState().signOut();
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/sign-in');
  });

  it('does nothing when the app starts signed out: the gate on the first screen handles that', async () => {
    useAuthStore.setState({ state: { status: 'restoring' } });
    await render(<SignOutRedirect />);
    await act(async () => {
      useAuthStore.setState({ state: { status: 'signedOut' } });
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does nothing when the driver is already on the sign-in screen', async () => {
    mockPathname = '/sign-in';
    useAuthStore.setState({ state: signedIn });
    await render(<SignOutRedirect />);
    await act(async () => {
      await useAuthStore.getState().signOut();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
