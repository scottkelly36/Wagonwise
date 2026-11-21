import { fireEvent, render, screen } from '@testing-library/react-native';
import { Share } from 'react-native';

import ReferScreen from '../app/refer';
import { useAuthStore } from '../state/auth-store';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
const ID = '11111111-1111-4111-8111-111111111111';
const mockData = {
  current: {
    code: 'WW-K7Q2MX',
    rewardPounds: 25,
    referrals: [
      {
        id: ID,
        firmName: 'Tyne Haulage Ltd',
        status: 'reward_due',
        createdAt: '2026-11-20T10:00:00.000Z',
      },
    ],
  },
};
const mockClaim = jest.fn();
const mockTrack = jest.fn();
jest.mock('../lib/flow-events', () => ({ trackFlow: (...args: unknown[]) => mockTrack(...args) }));
jest.mock('../api/use-referrals', () => ({
  useMyReferrals: () => ({ data: mockData.current, isLoading: false, isError: false }),
  useClaimReward: () => ({ mutate: mockClaim, isPending: false, isError: false }),
}));

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    state: {
      status: 'signedIn',
      accessToken: 'a',
      refreshToken: 'r',
      driver: {
        id: 'd',
        identifier: 'dave@example.com',
        createdAt: '2026-11-01T00:00:00.000Z',
        name: 'Dave',
      },
    },
  });
});

it('shows the code and sends the boss a message with it and the driver’s name', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  await render(<ReferScreen />);
  expect(screen.getByTestId('refer-code').props.children).toBe('WW-K7Q2MX');
  await fireEvent.press(screen.getByTestId('refer-share-button'));
  expect(share).toHaveBeenCalledWith({
    message: expect.stringMatching(/^Dave here\..*WW-K7Q2MX/s),
  });
  // Counted anonymously for the Flows panel: the screen opening, then the share.
  expect(mockTrack.mock.calls).toEqual([['referral_opened'], ['referral_shared']]);
});

it('asks for an email only once a reward is due, and claims it', async () => {
  await render(<ReferScreen />);
  expect(screen.getByTestId(`refer-claim-button-${ID}`).props.accessibilityState).toMatchObject({
    disabled: true,
  });
  await fireEvent.changeText(screen.getByTestId(`refer-email-${ID}`), ' dave@example.com ');
  await fireEvent.press(screen.getByTestId(`refer-claim-button-${ID}`));
  expect(mockClaim).toHaveBeenCalledWith({ id: ID, email: 'dave@example.com' });

  mockData.current = {
    ...mockData.current,
    referrals: [{ ...mockData.current.referrals[0]!, status: 'signed_up' }],
  };
  await render(<ReferScreen />);
  expect(screen.queryByTestId(`refer-claim-${ID}`)).toBeNull();
  expect(screen.getByText(/due when they pay their first bill/)).toBeTruthy();
});
