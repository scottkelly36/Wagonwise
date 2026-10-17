import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ParkingSuggestForm } from './parking-suggest-form';

const mockMutate = jest.fn();
let mockPending = false;
jest.mock('../api/use-parking', () => ({
  useSuggestParkingSpotEdit: () => ({ mutate: mockMutate, isPending: mockPending }),
}));

const spot: SafeParkingSpotDto = {
  id: '11111111-1111-4111-8111-111111111111' as SafeParkingSpotDto['id'],
  location: { lat: 54, lon: -2 },
  reportedAt: '2026-10-10T09:00:00.000Z',
  name: 'Exeter Truckstop',
  capacity: 40,
  toilets: true,
};

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockPending = false;
});

describe('ParkingSuggestForm', () => {
  it('sends only what changed, then thanks the driver once it has gone', async () => {
    const onDone = jest.fn();
    await render(<ParkingSuggestForm spot={spot} onDone={onDone} />);

    await fireEvent.changeText(screen.getByTestId('suggest-spaces'), '55');
    await fireEvent.press(screen.getByTestId('suggest-showers'));
    await fireEvent.press(screen.getByTestId('suggest-send'));

    expect(mockMutate).toHaveBeenCalledTimes(1);
    const [input, options] = mockMutate.mock.calls[0] as [
      { spotId: string; request: object },
      { onSuccess: () => void },
    ];
    expect(input).toEqual({ spotId: spot.id, request: { capacity: 55, showers: true } });

    await act(async () => {
      options.onSuccess();
    });
    expect(await screen.findByTestId('parking-suggest-sent')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('parking-suggest-back'));
    expect(onDone).toHaveBeenCalled();
  });

  it('asks for a change before sending, and sends nothing', async () => {
    await render(<ParkingSuggestForm spot={spot} onDone={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('suggest-send'));
    expect(screen.getByText('Change something first, then send.')).toBeTruthy();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('reports a place as closed or gone with one tap', async () => {
    await render(<ParkingSuggestForm spot={spot} onDone={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('suggest-gone'));
    expect(mockMutate.mock.calls[0]?.[0]).toEqual({ spotId: spot.id, request: { gone: true } });
  });
});
