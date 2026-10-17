import { act, fireEvent, render, screen } from '@testing-library/react-native';

import ReportSafeParkingSpotScreen from '../app/report-safe-parking-spot';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));
jest.mock('../components/route-map', () => ({ RouteMap: () => null }));
jest.mock('../components/ui/map-sheet', () => ({
  MapSheet: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../hooks/use-current-location', () => ({
  useCurrentLocation: () => ({ point: { lat: 54.97, lon: -2.1 } }),
}));

const mockMutate = jest.fn();
jest.mock('../api/use-parking', () => ({
  useReportSafeParkingSpot: () => ({ mutate: mockMutate, isPending: false }),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

beforeEach(() => jest.clearAllMocks());

type Mutation = [object, { onSuccess: (spot: { id: string }) => void }];

describe('Mark safe parking', () => {
  it('keeps the details closed, and sends just the note and place when none are added', async () => {
    await render(<ReportSafeParkingSpotScreen />);
    expect(screen.queryByTestId('parking-details')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('parking-note-input'), 'flat layby');
    await fireEvent.press(screen.getByTestId('report-parking-spot-submit-button'));
    const [input] = mockMutate.mock.calls[0] as Mutation;
    expect(input).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      location: { lat: 54.97, lon: -2.1 },
      note: 'flat layby',
    });
  });

  it('sends the name, spaces and what is there when the driver adds them', async () => {
    await render(<ReportSafeParkingSpotScreen />);
    await fireEvent.press(screen.getByTestId('parking-details-toggle'));
    await fireEvent.changeText(screen.getByTestId('parking-name-input'), 'Corbridge Layby');
    await fireEvent.changeText(screen.getByTestId('parking-spaces-input'), '6');
    await fireEvent.press(screen.getByTestId('report-toilets'));
    await fireEvent.press(screen.getByTestId('report-toilets')); // yes, then no
    await fireEvent.press(screen.getByTestId('report-lit'));
    await fireEvent.press(screen.getByTestId('report-parking-spot-submit-button'));
    const [input] = mockMutate.mock.calls[0] as Mutation;
    expect(input).toMatchObject({
      name: 'Corbridge Layby',
      capacity: 6,
      toilets: false,
      lit: true,
    });
  });

  it('refuses spaces that are not a number, without sending', async () => {
    await render(<ReportSafeParkingSpotScreen />);
    await fireEvent.press(screen.getByTestId('parking-details-toggle'));
    await fireEvent.changeText(screen.getByTestId('parking-spaces-input'), 'lots');
    await fireEvent.press(screen.getByTestId('report-parking-spot-submit-button'));
    expect(screen.getByText('Spaces should be a whole number, like 12.')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('goes back when it makes a new place, but says the details will be checked when the place was already there', async () => {
    await render(<ReportSafeParkingSpotScreen />);
    await fireEvent.press(screen.getByTestId('parking-details-toggle'));
    await fireEvent.changeText(screen.getByTestId('parking-name-input'), 'Better name');
    await fireEvent.press(screen.getByTestId('report-parking-spot-submit-button'));
    const [, options] = mockMutate.mock.calls[0] as Mutation;

    await act(async () => {
      options.onSuccess({ id: '99999999-9999-4999-8999-999999999999' }); // an existing place
    });
    expect(await screen.findByTestId('parking-merged')).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Done'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('goes straight back after a new place', async () => {
    await render(<ReportSafeParkingSpotScreen />);
    await fireEvent.press(screen.getByTestId('report-parking-spot-submit-button'));
    const [, options] = mockMutate.mock.calls[0] as Mutation;
    await act(async () => {
      options.onSuccess({ id: '11111111-1111-4111-8111-111111111111' });
    });
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
