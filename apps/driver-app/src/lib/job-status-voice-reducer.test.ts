import {
  confirmationPrompt,
  INITIAL_JOB_STATUS_VOICE_STATE,
  isBusy,
  isListening,
  jobStatusVoiceReducer,
  outcomeMessage,
  type JobStatusVoiceEvent,
  type JobStatusVoiceState,
} from './job-status-voice-reducer';

const STEP = { to: 'en_route' as const, label: 'Set off' };

function run(events: JobStatusVoiceEvent[]): JobStatusVoiceState {
  return events.reduce(jobStatusVoiceReducer, INITIAL_JOB_STATUS_VOICE_STATE);
}

describe('jobStatusVoiceReducer', () => {
  it('listens, reads the matched step back, and advances on a yes', () => {
    expect(run([{ type: 'start' }])).toEqual({ phase: 'capturing-report' });

    const matched = run([{ type: 'start' }, { type: 'report-matched', step: STEP }]);
    expect(matched).toEqual({ phase: 'confirming', step: STEP });

    const confirming = run([
      { type: 'start' },
      { type: 'report-matched', step: STEP },
      { type: 'prompt-spoken' },
    ]);
    expect(confirming).toEqual({ phase: 'capturing-confirmation', step: STEP });

    const advancing = run([
      { type: 'start' },
      { type: 'report-matched', step: STEP },
      { type: 'prompt-spoken' },
      { type: 'confirmed' },
    ]);
    expect(advancing).toEqual({ phase: 'advancing', step: STEP });

    const advanced = run([
      { type: 'start' },
      { type: 'report-matched', step: STEP },
      { type: 'prompt-spoken' },
      { type: 'confirmed' },
      { type: 'advance-succeeded' },
    ]);
    expect(advanced).toEqual({ phase: 'advanced' });
  });

  it("goes to not-understood when the transcript doesn't match the current step", () => {
    expect(run([{ type: 'start' }, { type: 'report-not-matched' }])).toEqual({
      phase: 'not-understood',
    });
  });

  it('declines without advancing anything on a no', () => {
    const state = run([
      { type: 'start' },
      { type: 'report-matched', step: STEP },
      { type: 'prompt-spoken' },
      { type: 'declined' },
    ]);
    expect(state).toEqual({ phase: 'declined' });
  });

  it('a capture failure (e.g. no microphone permission) goes straight to error', () => {
    const state = run([{ type: 'report-capture-failed', message: 'Microphone access is off.' }]);
    expect(state).toEqual({ phase: 'error', message: 'Microphone access is off.' });
  });

  it('a failed advance reports the error without losing the step', () => {
    const state = run([
      { type: 'start' },
      { type: 'report-matched', step: STEP },
      { type: 'prompt-spoken' },
      { type: 'confirmed' },
      { type: 'advance-failed', message: "Couldn't save that." },
    ]);
    expect(state).toEqual({ phase: 'error', message: "Couldn't save that." });
  });

  it("ignores events that don't apply to the current phase", () => {
    expect(run([{ type: 'confirmed' }])).toEqual(INITIAL_JOB_STATUS_VOICE_STATE);
    expect(run([{ type: 'start' }, { type: 'start' }])).toEqual({ phase: 'capturing-report' });
  });

  it('reset always returns to idle', () => {
    expect(
      run([{ type: 'start' }, { type: 'report-matched', step: STEP }, { type: 'reset' }]),
    ).toEqual(INITIAL_JOB_STATUS_VOICE_STATE);
  });
});

describe('confirmationPrompt', () => {
  it('reads the label back as a question', () => {
    expect(confirmationPrompt('Loaded')).toBe('Loaded — is that right?');
  });
});

describe('outcomeMessage', () => {
  it('has a spoken line for every ending phase, and none for one still in progress', () => {
    expect(outcomeMessage({ phase: 'advanced' })).toBe('Updated.');
    expect(outcomeMessage({ phase: 'declined' })).toBe('Not updated.');
    expect(outcomeMessage({ phase: 'not-understood' })).toBe("Didn't catch that.");
    expect(outcomeMessage({ phase: 'error', message: 'oops' })).toBe('oops');
    expect(outcomeMessage({ phase: 'capturing-report' })).toBeUndefined();
    expect(outcomeMessage({ phase: 'idle' })).toBeUndefined();
  });
});

describe('isListening / isBusy', () => {
  it('flags the two listening phases and the two busy phases', () => {
    expect(isListening({ phase: 'capturing-report' })).toBe(true);
    expect(isListening({ phase: 'capturing-confirmation', step: STEP })).toBe(true);
    expect(isListening({ phase: 'idle' })).toBe(false);

    expect(isBusy({ phase: 'confirming', step: STEP })).toBe(true);
    expect(isBusy({ phase: 'advancing', step: STEP })).toBe(true);
    expect(isBusy({ phase: 'idle' })).toBe(false);
  });
});
