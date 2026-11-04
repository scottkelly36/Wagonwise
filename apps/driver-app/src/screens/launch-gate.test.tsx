import { render, screen } from '@testing-library/react-native';

import IndexScreen from '../app';
import { CONSENT_VERSION } from '../lib/consent-version';
import { useAuthStore } from '../state/auth-store';
import { useWalkthroughStore } from '../state/walkthrough-store';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text: MockText } = require('react-native') as typeof import('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <MockText testID="redirect">{href}</MockText>,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual<object>('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn() }));

let mockResume: { isPending: boolean; data?: { trip: unknown; plan: unknown } } = {
  isPending: false,
};
jest.mock('../api/use-active-trip', () => ({ useResumeActiveTrip: () => mockResume }));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

const driver = {
  id: 'd1',
  identifier: 'a@example.com',
  createdAt: '2026-11-01T00:00:00.000Z',
  consentedAt: '2026-11-01T00:00:00.000Z',
  consentVersion: CONSENT_VERSION,
};

const where = () => screen.getByTestId('redirect').props.children as string;

beforeEach(() => {
  mockResume = { isPending: false };
  useWalkthroughStore.setState({ status: 'seen' });
  useAuthStore.setState({
    state: { status: 'signedIn', accessToken: 'a', refreshToken: 'r', driver },
  });
});

describe('launch gate', () => {
  it('goes to the map when the tour has been seen', async () => {
    await render(<IndexScreen />);
    expect(where()).toBe('/home');
  });

  it('shows the tour once to a driver who has not seen it', async () => {
    useWalkthroughStore.setState({ status: 'unseen' });
    await render(<IndexScreen />);
    expect(where()).toBe('/walkthrough');
  });

  it('waits, without redirecting, until the phone has said whether it was seen', async () => {
    useWalkthroughStore.setState({ status: 'restoring' });
    await render(<IndexScreen />);
    expect(screen.queryByTestId('redirect')).toBeNull();
  });

  it('puts a trip in progress ahead of the tour', async () => {
    useWalkthroughStore.setState({ status: 'unseen' });
    mockResume = { isPending: false, data: { trip: {}, plan: {} } };
    await render(<IndexScreen />);
    expect(where()).toBe('/active-trip');
  });

  it('asks for the privacy screen before the tour', async () => {
    useWalkthroughStore.setState({ status: 'unseen' });
    useAuthStore.setState({
      state: {
        status: 'signedIn',
        accessToken: 'a',
        refreshToken: 'r',
        driver: { ...driver, consentedAt: undefined, consentVersion: undefined },
      },
    });
    await render(<IndexScreen />);
    expect(where()).toBe('/consent');
  });
});
