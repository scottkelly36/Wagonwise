import {
  INITIAL_VOICE_CAPTURE_STATE,
  voiceCaptureReducer,
  type VoiceCaptureState,
} from './voice-capture-reducer';

const origin = { lat: 54.9707, lon: -2.1013 };

describe('voiceCaptureReducer', () => {
  it('starts idle', () => {
    expect(INITIAL_VOICE_CAPTURE_STATE).toEqual({ status: 'idle' });
  });

  it('start-requested moves to starting from any state', () => {
    expect(voiceCaptureReducer({ status: 'idle' }, { type: 'start-requested' })).toEqual({
      status: 'starting',
    });
    expect(
      voiceCaptureReducer(
        { status: 'transcribed', origin, transcript: 'low bridge' },
        { type: 'start-requested' },
      ),
    ).toEqual({ status: 'starting' });
  });

  it('permission-denied moves to permission-denied', () => {
    expect(voiceCaptureReducer({ status: 'starting' }, { type: 'permission-denied' })).toEqual({
      status: 'permission-denied',
    });
  });

  it('native-started moves to listening and attaches the origin', () => {
    expect(voiceCaptureReducer({ status: 'starting' }, { type: 'native-started', origin })).toEqual(
      { status: 'listening', origin },
    );
  });

  it('native-started with no origin (location denied/unavailable) still starts listening', () => {
    expect(
      voiceCaptureReducer({ status: 'starting' }, { type: 'native-started', origin: undefined }),
    ).toEqual({ status: 'listening', origin: undefined });
  });

  it('result moves to transcribed, keeping the origin captured at start', () => {
    const listening: VoiceCaptureState = { status: 'listening', origin };
    expect(
      voiceCaptureReducer(listening, { type: 'result', transcript: 'low bridge ahead' }),
    ).toEqual({
      status: 'transcribed',
      origin,
      transcript: 'low bridge ahead',
    });
  });

  it('no-speech while listening moves to no-speech', () => {
    expect(voiceCaptureReducer({ status: 'listening', origin }, { type: 'no-speech' })).toEqual({
      status: 'no-speech',
      origin,
    });
  });

  it('no-speech while starting moves to no-speech', () => {
    expect(voiceCaptureReducer({ status: 'starting' }, { type: 'no-speech' })).toEqual({
      status: 'no-speech',
      origin: undefined,
    });
  });

  it('a trailing no-speech (the recognizer end event) never overwrites an already-transcribed result', () => {
    const transcribed: VoiceCaptureState = {
      status: 'transcribed',
      origin,
      transcript: 'flooding',
    };
    expect(voiceCaptureReducer(transcribed, { type: 'no-speech' })).toEqual(transcribed);
  });

  it('a trailing no-speech never overwrites an error', () => {
    const errored: VoiceCaptureState = { status: 'error', errorMessage: 'network' };
    expect(voiceCaptureReducer(errored, { type: 'no-speech' })).toEqual(errored);
  });

  it('a trailing no-speech never overwrites a permission denial', () => {
    const denied: VoiceCaptureState = { status: 'permission-denied' };
    expect(voiceCaptureReducer(denied, { type: 'no-speech' })).toEqual(denied);
  });

  it('error moves to error with the message', () => {
    expect(
      voiceCaptureReducer({ status: 'listening', origin }, { type: 'error', message: 'network' }),
    ).toEqual({ status: 'error', errorMessage: 'network' });
  });

  it('reset returns to idle from any state', () => {
    expect(
      voiceCaptureReducer(
        { status: 'transcribed', origin, transcript: 'low bridge' },
        { type: 'reset' },
      ),
    ).toEqual({ status: 'idle' });
  });

  describe("ignores native events for a session it didn't start", () => {
    const resting: VoiceCaptureState[] = [
      { status: 'idle' },
      { status: 'transcribed', origin, transcript: 'low bridge' },
      { status: 'no-speech', origin },
      { status: 'error', errorMessage: 'network' },
      { status: 'permission-denied' },
    ];

    it.each(resting)('native-started leaves $status unchanged', (state) => {
      expect(voiceCaptureReducer(state, { type: 'native-started', origin })).toBe(state);
    });

    it.each(resting)('result leaves $status unchanged', (state) => {
      expect(voiceCaptureReducer(state, { type: 'result', transcript: 'yes' })).toBe(state);
    });

    it.each(resting)('error leaves $status unchanged', (state) => {
      expect(voiceCaptureReducer(state, { type: 'error', message: 'busy' })).toBe(state);
    });

    it('native-started while already listening keeps the original origin', () => {
      const listening: VoiceCaptureState = { status: 'listening', origin };
      expect(voiceCaptureReducer(listening, { type: 'native-started', origin: undefined })).toBe(
        listening,
      );
    });
  });
});
