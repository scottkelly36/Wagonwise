import { render, screen } from '@testing-library/react-native';

import IndexScreen from '../app';
import { CONSENT_VERSION } from '../lib/consent-version';
import { useAuthStore } from '../state/auth-store';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
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
const mockResumeCalls: unknown[][] = [];
jest.mock('../api/use-active-trip', () => ({
  useResumeActiveTrip: (...args: unknown[]) => {
    mockResumeCalls.push(args);
    return mockResume;
  },
}));

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
  mockResumeCalls.length = 0;
  useCurrentActiveTripStore.setState({ trip: undefined });
  useCurrentRoutePlanStore.setState({ plan: undefined });
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

  it('puts the driver back on a trip kept on the phone when there is no signal, and fills the trip and plan the screen reads', async () => {
    useWalkthroughStore.setState({ status: 'unseen' });
    const trip = { id: 'trip-1' };
    const plan = { id: 'plan-1' };
    mockResume = { isPending: false, data: { trip, plan, fromPhone: true } as never };
    await render(<IndexScreen />);
    expect(where()).toBe('/active-trip');
    expect(useCurrentActiveTripStore.getState().trip).toBe(trip);
    expect(useCurrentRoutePlanStore.getState().plan).toBe(plan);
  });

  it('tells the resume check which driver is signed in, so another driver’s saved trip is never brought back', async () => {
    await render(<IndexScreen />);
    expect(mockResumeCalls[0]).toEqual(['a', 'd1']);
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
