import { fireEvent, render, screen } from '@testing-library/react-native';

import HoursScreen from '../app/(tabs)/hours';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View };
});
jest.mock('../lib/pick-card-file', () => ({ canPickFiles: () => true, pickCardFile: jest.fn() }));
const mockMine = {
  current: { data: [] as unknown[], isSuccess: true },
};
jest.mock('../api/use-tachograph', () => ({ useMyTachograph: () => mockMine.current }));

jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockMine.current = { data: [], isSuccess: true };
});

describe('Hours tab', () => {
  it('opens the driving hours clock', async () => {
    await render(<HoursScreen />);
    await fireEvent.press(screen.getByTestId('shift-button'));
    expect(mockPush).toHaveBeenCalledWith('/shift');
  });

  it('says when the driver is not linked to a company, and offers to send a file', async () => {
    await render(<HoursScreen />);
    expect(screen.getByText('You are not linked to a company yet.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('tachograph-button'));
    expect(mockPush).toHaveBeenCalledWith('/tachograph');
  });

  it('shows what each company last received, or that it has not switched this on', async () => {
    mockMine.current = {
      isSuccess: true,
      data: [
        { companyId: 'c1', companyName: 'Tyne Haulage Ltd', firmEnabled: false },
        { companyId: 'c2', companyName: 'Wear Freight', firmEnabled: true },
      ],
    };
    await render(<HoursScreen />);
    expect(screen.getByTestId('hours-c1').props.children.join('')).toMatch(
      /Tyne Haulage Ltd: has not switched this on yet/,
    );
    expect(screen.getByTestId('hours-c2').props.children.join('')).toMatch(
      /Wear Freight: You have not sent a file here yet/,
    );
  });

  it('offers the card reader in a test build', async () => {
    await render(<HoursScreen />);
    await fireEvent.press(screen.getByTestId('read-card-button'));
    expect(mockPush).toHaveBeenCalledWith('/read-card');
  });
});
