import { act, renderHook } from '@testing-library/react-native';

import { useHazardStillThere, type StillThereHazard } from './use-hazard-still-there';

const mockSpeak = jest.fn((_text: string, options?: { onDone?: () => void }) => {
  setTimeout(() => options?.onDone?.(), 0);
});
jest.mock('expo-speech', () => ({
  speak: (text: string, options?: { onDone?: () => void }) => mockSpeak(text, options),
  isSpeakingAsync: jest.fn(async () => false),
  stop: jest.fn(),
}));

const mockStart = jest.fn();
const mockCancel = jest.fn();
let mockCaptureState: { status: string; transcript?: string } = { status: 'idle' };
jest.mock('./use-voice-report-capture', () => ({
  useVoiceReportCapture: () => ({
    state: mockCaptureState,
    start: mockStart,
    cancel: mockCancel,
    reset: jest.fn(),
  }),
}));

const mockConfirm = jest.fn();
const mockDismiss = jest.fn();
jest.mock('../api/use-hazards', () => ({
  useConfirmHazard: () => ({ mutate: mockConfirm }),
  useDismissHazard: () => ({ mutate: mockDismiss }),
}));

// A straight route north along one line of longitude, 11 km long; one degree of latitude is about 111 km.
const routeLine: [number, number][] = [
  [-2, 55],
  [-2, 55.1],
];
const hazard: StillThereHazard = {
  id: 'h1',
  type: 'low_bridge',
  location: { lat: 55.05, lon: -2 },
};
const before = { lat: 55.047, lon: -2 }; // about 330 m before the hazard
const justPast = { lat: 55.0515, lon: -2 }; // about 170 m past it

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCaptureState = { status: 'idle' };
});

type Props = { position: { lat: number; lon: number }; enabled: boolean };

async function setup(enabled = true) {
  return renderHook(
    ({ position, enabled: on }: Props) => useHazardStillThere(routeLine, position, [hazard], on),
    { initialProps: { position: before, enabled } as Props },
  );
}

describe('useHazardStillThere', () => {
  it('asks once the hazard is 150 m behind, listens, and confirms it on a yes', async () => {
    const { rerender, result } = await setup();
    await settle();
    expect(mockSpeak).not.toHaveBeenCalled();

    await rerender({ position: justPast, enabled: true });
    await settle();
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    expect(mockSpeak.mock.calls[0]?.[0]).toMatch(
      /Low bridge: was it still there\? Say yes or no\./,
    );
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(result.current.busy).toBe(true);

    mockCaptureState = { status: 'transcribed', transcript: 'yeah it was' };
    await rerender({ position: justPast, enabled: true });
    await settle();
    expect(mockConfirm).toHaveBeenCalledWith('h1');
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockSpeak.mock.calls.map((call) => call[0])).toContain('Thanks.');
    expect(result.current.busy).toBe(false);
  });

  it('counts a no as one "not there"', async () => {
    const { rerender } = await setup();
    await rerender({ position: justPast, enabled: true });
    await settle();
    mockCaptureState = { status: 'transcribed', transcript: 'nope' };
    await rerender({ position: justPast, enabled: true });
    await settle();
    expect(mockDismiss).toHaveBeenCalledWith('h1');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('does nothing, and does not ask again, when there is no answer', async () => {
    const { rerender } = await setup();
    await rerender({ position: justPast, enabled: true });
    await settle();
    mockCaptureState = { status: 'no-speech' };
    await rerender({ position: justPast, enabled: true });
    await settle();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockDismiss).not.toHaveBeenCalled();
    const asked = mockSpeak.mock.calls.length;
    await rerender({ position: { lat: 55.0518, lon: -2 }, enabled: true });
    await settle();
    expect(mockSpeak.mock.calls.length).toBe(asked);
  });

  it('asks nothing when the questions are off or the voice is busy (enabled is false)', async () => {
    const { rerender } = await setup(false);
    await rerender({ position: justPast, enabled: false });
    await settle();
    expect(mockSpeak).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });
});
