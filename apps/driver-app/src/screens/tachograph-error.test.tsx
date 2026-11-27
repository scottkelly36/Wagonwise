import { fireEvent, render, screen } from '@testing-library/react-native';

import TachographScreen from '../app/tachograph';
import { ApiError } from '../api/errors';

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
jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('../lib/pick-card-file', () => ({ canPickFiles: () => true, pickCardFile: jest.fn() }));
const mockRefetch = jest.fn();
const mockError = { current: new ApiError('internal_error', 500) as Error };
jest.mock('../api/use-tachograph', () => ({
  useMyTachograph: () => ({
    data: undefined,
    isLoading: false,
    isError: true,
    error: mockError.current,
    refetch: mockRefetch,
  }),
  useSendTachographFile: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.setTimeout(30_000);

it('says what failed in a test build, and lets the driver try again', async () => {
  await render(<TachographScreen />);
  expect(screen.getByText(/Could not load your companies/)).toBeTruthy();
  expect(screen.getByTestId('tachograph-error-detail').props.children.join('')).toBe(
    'Test build: internal_error (500)',
  );
  await fireEvent.press(screen.getByTestId('tachograph-retry'));
  expect(mockRefetch).toHaveBeenCalled();
});
