import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import TachographScreen from '../app/tachograph';
import { HAULIERS_SIGNUP_URL } from '../lib/referral-share';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../lib/pick-card-file', () => ({ canPickFiles: () => true, pickCardFile: jest.fn() }));
const mockMine = {
  current: {
    data: [] as unknown[],
    isLoading: false,
    isError: false,
  },
};
jest.mock('../api/use-tachograph', () => ({
  useMyTachograph: () => mockMine.current,
  useSendTachographFile: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockMine.current = { data: [], isLoading: false, isError: false };
});

describe('a driver whose company is not on WagonWise', () => {
  it('is told what the office gets and can take it to their boss', async () => {
    await render(<TachographScreen />);
    expect(screen.getByTestId('tachograph-interest')).toBeTruthy();
    expect(screen.getByText(/You are not linked to a company yet/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('tachograph-interest-boss'));
    expect(mockPush).toHaveBeenCalledWith('/refer');
  });

  it('can start a trial for their own firm on the website', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<TachographScreen />);
    await fireEvent.press(screen.getByTestId('tachograph-interest-own'));
    expect(open).toHaveBeenCalledWith(HAULIERS_SIGNUP_URL);
    expect(HAULIERS_SIGNUP_URL).toBe('https://wagon-wise.co.uk/for-hauliers/#signup');
  });

  it('is not shown to a driver whose company is already on it', async () => {
    mockMine.current = {
      data: [{ companyId: 'c1', companyName: 'Tyne Haulage Ltd', firmEnabled: false }],
      isLoading: false,
      isError: false,
    };
    await render(<TachographScreen />);
    expect(screen.queryByTestId('tachograph-interest')).toBeNull();
    expect(screen.getByText(/has not switched this on/)).toBeTruthy();
  });
});
