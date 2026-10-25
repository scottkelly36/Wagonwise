import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { SosSheet } from './sos-sheet';

const REQUEST = '11111111-1111-4111-8111-111111111111';
const ACME = '22222222-2222-4222-8222-222222222222';

const mockRaise = jest.fn();
const mockCancel = jest.fn();
let mockRaiseFailed = false;
jest.mock('../api/use-sos', () => ({
  useRaiseSos: () => ({ mutate: mockRaise, isPending: false, isError: mockRaiseFailed }),
  useCancelSos: () => ({ mutate: mockCancel, isPending: false, isError: false }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }));

jest.setTimeout(30_000);

const point = { lat: 54.9731, lon: -2.1013 };
const linkedAnswer = {
  requestId: REQUEST,
  location: point,
  words: 'recapture.streaking.parent',
  nearestPlace: 'Hexham, Northumberland',
  notified: [{ companyId: ACME, name: 'Acme Haulage' }],
};

/** What the screen does when the server answers: calls the success callback the sheet gave. */
function answerWith(answer: object) {
  mockRaise.mockImplementation((_input: unknown, options: { onSuccess: (a: object) => void }) =>
    options.onSuccess(answer),
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRaiseFailed = false;
});

afterEach(() => {
  jest.useRealTimers();
});

async function hold(ms: number) {
  const button = screen.getByTestId('sos-hold-button');
  await fireEvent(button, 'pressIn');
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  await fireEvent(button, 'pressOut');
}

describe('SosSheet', () => {
  it('says what it does and does not do, and always offers 999', async () => {
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    expect(screen.getByText(/does not call the emergency services/i)).toBeTruthy();
    expect(screen.getByTestId('sos-call-999-button')).toBeTruthy();
    expect(screen.getByText('HOLD TO SEND SOS')).toBeTruthy();
  });

  it('sends nothing when the button is let go before two seconds, however often it is tried', async () => {
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    await hold(1500);
    await hold(1900);
    await hold(500);
    expect(mockRaise).not.toHaveBeenCalled();
    expect(screen.getByText('HOLD TO SEND SOS')).toBeTruthy();
  });

  it('sends once, with the position, when held for two seconds, even after a short press first', async () => {
    answerWith(linkedAnswer);
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    await hold(800);
    expect(mockRaise).not.toHaveBeenCalled();
    await hold(2100);
    expect(mockRaise).toHaveBeenCalledTimes(1);
    expect(mockRaise.mock.calls[0]?.[0]).toEqual({ requestId: REQUEST, location: point });
  });

  it('shows the three words one to a line, who was told, 999, and a way to say it was a mistake', async () => {
    answerWith(linkedAnswer);
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    await hold(2100);
    expect(screen.getByText('///recapture.')).toBeTruthy();
    expect(screen.getByText('streaking.')).toBeTruthy();
    expect(screen.getByText('parent')).toBeTruthy();
    expect(screen.getByText(/near Hexham, Northumberland/)).toBeTruthy();
    expect(screen.getByTestId('sos-outcome').props.children).toMatch(/Acme Haulage has been told/);
    expect(screen.getByTestId('sos-call-999-button')).toBeTruthy();
    expect(screen.getByTestId('sos-cancel-button')).toBeTruthy();
  });

  it('cancels with the same request id and says the company has been told', async () => {
    answerWith(linkedAnswer);
    mockCancel.mockImplementation((_id: string, options: { onSuccess: () => void }) =>
      options.onSuccess(),
    );
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    await hold(2100);
    await fireEvent.press(screen.getByTestId('sos-cancel-button'));
    expect(mockCancel.mock.calls[0]?.[0]).toBe(REQUEST);
    expect(screen.getByTestId('sos-cancelled')).toBeTruthy();
  });

  it('for a driver with no company shows the words to read out and nothing about telling anyone', async () => {
    answerWith({ ...linkedAnswer, notified: [] });
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    await hold(2100);
    expect(screen.getByText('///recapture.')).toBeTruthy();
    expect(screen.getByTestId('sos-outcome').props.children).toMatch(/^Nobody was told/);
    expect(screen.queryByTestId('sos-cancel-button')).toBeNull();
  });

  it('shows the position to read out when there are no three words', async () => {
    answerWith({ ...linkedAnswer, words: undefined, nearestPlace: undefined });
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    await hold(2100);
    expect(screen.getByText('54.97310, -2.10130')).toBeTruthy();
  });

  it('says nobody was told when it could not be sent, with the position, and tries again with the same id', async () => {
    mockRaiseFailed = true;
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    expect(screen.getByTestId('sos-failed')).toBeTruthy();
    expect(screen.getByText(/Nobody has been told/)).toBeTruthy();
    expect(screen.getByText(/54\.97310, -2\.10130/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('sos-retry-button'));
    expect(mockRaise.mock.calls[0]?.[0]).toEqual({ requestId: REQUEST, location: point });
  });

  it('cannot be held without a position', async () => {
    await render(<SosSheet visible onClose={jest.fn()} point={undefined} />);
    expect(screen.getByText('Waiting for your position…')).toBeTruthy();
    await hold(2100);
    expect(mockRaise).not.toHaveBeenCalled();
  });

  it('rings 999 from the call button', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    await render(<SosSheet visible onClose={jest.fn()} point={point} />);
    await fireEvent.press(screen.getByTestId('sos-call-999-button'));
    expect(open).toHaveBeenCalledWith('tel:999');
  });

  it('renders nothing when it is not visible', async () => {
    await render(<SosSheet visible={false} onClose={jest.fn()} point={point} />);
    expect(screen.queryByTestId('sos-hold-button')).toBeNull();
  });
});
