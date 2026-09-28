import { act, renderHook } from '@testing-library/react-native';

import { useVoiceHazardReportFlow } from './use-voice-hazard-report-flow';

// --- Native speech recognition: a registry of mockListeners the test fires by hand. ---------------
type Listener = (event: unknown) => void;
const mockListeners = new Map<string, Set<Listener>>();

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    abort: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
  },
  useSpeechRecognitionEvent: (name: string, handler: Listener) => {
    // Re-registered on every render; the latest handler is the live one.
    const set = mockListeners.get(name) ?? new Set<Listener>();
    set.clear();
    set.add(handler);
    mockListeners.set(name, set);
  },
}));

async function fire(name: string, event: unknown = {}): Promise<void> {
  await act(async () => {
    for (const handler of mockListeners.get(name) ?? []) handler(event);
  });
}

/** One full native capture session: started, a final transcript, then the natural end. */
async function say(transcript: string): Promise<void> {
  // Let the capture hook's async start (permission + location) settle first.
  await act(async () => {});
  await fire('start');
  await fire('result', { isFinal: true, results: [{ transcript }] });
  await fire('end');
  // Let the parse call and the spoken read-back (both asynchronous) finish.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

jest.mock('../lib/voice-report-permission', () => ({
  obtainVoiceCapturePermission: jest.fn(async () => ({ ok: true })),
}));

const origin = { lat: 54.9707, lon: -2.1013 };
jest.mock('./use-current-location', () => ({
  fetchCurrentLocation: jest.fn(async () => ({ ok: true, point: { lat: 54.9707, lon: -2.1013 } })),
}));

jest.mock('expo-speech', () => ({
  // Asynchronous like the real thing: speech takes seconds, so the capture session's own `end`
  // event always lands before the read-back finishes.
  speak: jest.fn((_text: string, options?: { onDone?: () => void }) => {
    setTimeout(() => options?.onDone?.(), 0);
  }),
  stop: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
}));

const mockParsed = { type: 'low_bridge', measurement: { kind: 'height', value: 3.5 } };
const mockReportMutate = jest.fn((_request: unknown, callbacks: { onSuccess: () => void }) =>
  callbacks.onSuccess(),
);
jest.mock('../api/use-hazards', () => ({
  useParseVoiceHazardReport: () => ({
    // A network round trip in reality — resolves after the current events have been handled.
    mutate: (_transcript: string, callbacks: { onSuccess: (p: unknown) => void }) => {
      setTimeout(() => callbacks.onSuccess(mockParsed), 0);
    },
  }),
  useReportHazard: () => ({ mutate: mockReportMutate }),
}));

jest.mock('../db/hazard-queue', () => ({
  enqueueHazardReport: jest.fn(async () => undefined),
  removeQueuedHazardReport: jest.fn(async () => undefined),
}));

const mockSaveDraft = jest.fn(async () => undefined);
jest.mock('../db/voice-draft-queue', () => ({
  saveVoiceHazardDraft: (...args: unknown[]) => mockSaveDraft(...(args as [])),
}));

jest.mock('../lib/voice-report-summary', () => ({
  summaryFor: () => 'Low bridge, 3.5 metres. Save it?',
}));

beforeEach(() => {
  mockListeners.clear();
  mockReportMutate.mockClear();
  mockSaveDraft.mockClear();
});

describe('useVoiceHazardReportFlow', () => {
  it("doesn't treat the report itself as the yes/no answer", async () => {
    const { result } = await renderHook(() => useVoiceHazardReportFlow(origin));

    await act(async () => result.current.start());
    await say('low bridge three and a half metres');

    // Read back, now waiting for the driver's reply — not already decided from the report text.
    expect(result.current.state.phase).toBe('capturing-confirmation');
    expect(mockSaveDraft).not.toHaveBeenCalled();
    expect(mockReportMutate).not.toHaveBeenCalled();
  });

  it('files the report when the driver says yes', async () => {
    const { result } = await renderHook(() => useVoiceHazardReportFlow(origin));

    await act(async () => result.current.start());
    await say('low bridge three and a half metres');
    await say('yes');

    expect(result.current.state.phase).toBe('filed');
    expect(mockReportMutate).toHaveBeenCalledTimes(1);
    expect(mockReportMutate.mock.calls[0]?.[0]).toMatchObject({
      type: 'low_bridge',
      location: origin,
      source: 'voice',
    });
    expect(mockSaveDraft).not.toHaveBeenCalled();
  });

  it('saves a draft, not a public report, when the driver says no', async () => {
    const { result } = await renderHook(() => useVoiceHazardReportFlow(origin));

    await act(async () => result.current.start());
    await say('low bridge three and a half metres');
    await say('no');

    expect(result.current.state.phase).toBe('draft-saved');
    expect(mockReportMutate).not.toHaveBeenCalled();
    expect(mockSaveDraft).toHaveBeenCalledTimes(1);
  });
});
