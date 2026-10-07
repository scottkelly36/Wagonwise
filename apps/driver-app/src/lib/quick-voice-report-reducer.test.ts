import {
  activeKind,
  confirmationPrompt,
  INITIAL_QUICK_VOICE_REPORT_STATE,
  isBusy,
  isListening,
  outcomeMessage,
  quickVoiceReportReducer,
  type QuickVoiceReportEvent,
  type QuickVoiceReportState,
} from './quick-voice-report-reducer';

function run(events: QuickVoiceReportEvent[]): QuickVoiceReportState {
  return events.reduce(quickVoiceReportReducer, INITIAL_QUICK_VOICE_REPORT_STATE);
}

describe('quickVoiceReportReducer — traffic', () => {
  it('asks the wait, reads it back, and files on a yes', () => {
    expect(run([{ type: 'start', kind: 'traffic' }])).toEqual({ phase: 'asking-wait' });
    expect(run([{ type: 'start', kind: 'traffic' }, { type: 'question-spoken' }])).toEqual({
      phase: 'capturing-wait',
    });

    const heard = run([
      { type: 'start', kind: 'traffic' },
      { type: 'question-spoken' },
      { type: 'wait-heard', waitMinutes: 25 },
    ]);
    expect(heard).toEqual({
      phase: 'confirming',
      kind: 'traffic',
      waitMinutes: 30,
      prompt: "Traffic, about 30 minutes' wait, here. Report it?",
    });

    expect(
      run([
        { type: 'start', kind: 'traffic' },
        { type: 'question-spoken' },
        { type: 'wait-heard', waitMinutes: 25 },
        { type: 'prompt-spoken' },
        { type: 'confirmed' },
      ]),
    ).toEqual({ phase: 'filing', kind: 'traffic', waitMinutes: 30 });
  });

  it('falls back to 15 minutes when no number was heard', () => {
    const state = run([
      { type: 'start', kind: 'traffic' },
      { type: 'question-spoken' },
      { type: 'wait-heard', waitMinutes: undefined },
    ]);
    expect(state).toMatchObject({ phase: 'confirming', waitMinutes: 15 });
  });
});

describe('quickVoiceReportReducer — parking', () => {
  it('files at once with no spoken question', () => {
    expect(run([{ type: 'start', kind: 'parking' }])).toEqual({ phase: 'filing', kind: 'parking' });
    expect(run([{ type: 'start', kind: 'parking' }, { type: 'file-succeeded' }])).toEqual({
      phase: 'filed',
      kind: 'parking',
    });
  });

  it('can be undone once filed, and not before or after another report', () => {
    expect(
      run([{ type: 'start', kind: 'parking' }, { type: 'file-succeeded' }, { type: 'undone' }]),
    ).toEqual({ phase: 'undone', kind: 'parking' });
    // Nothing to undo while it is still being saved.
    expect(run([{ type: 'start', kind: 'parking' }, { type: 'undone' }])).toEqual({
      phase: 'filing',
      kind: 'parking',
    });
  });
});

describe('quickVoiceReportReducer — confirmation rules', () => {
  const listeningForYesNo: QuickVoiceReportState = {
    phase: 'capturing-confirmation',
    kind: 'traffic',
    waitMinutes: 15,
  };

  it('never files without a yes: a decline ends in not-filed', () => {
    expect(quickVoiceReportReducer(listeningForYesNo, { type: 'declined' })).toEqual({
      phase: 'not-filed',
      kind: 'traffic',
    });
  });

  it('ignores a yes that arrives outside the confirmation step', () => {
    const asking: QuickVoiceReportState = { phase: 'asking-wait' };
    expect(quickVoiceReportReducer(asking, { type: 'confirmed' })).toBe(asking);
    expect(quickVoiceReportReducer(INITIAL_QUICK_VOICE_REPORT_STATE, { type: 'confirmed' })).toBe(
      INITIAL_QUICK_VOICE_REPORT_STATE,
    );
  });

  it('reports success or failure only from filing', () => {
    const filing: QuickVoiceReportState = { phase: 'filing', kind: 'parking' };
    expect(quickVoiceReportReducer(filing, { type: 'file-succeeded' })).toEqual({
      phase: 'filed',
      kind: 'parking',
    });
    expect(quickVoiceReportReducer(filing, { type: 'file-failed', message: 'No signal.' })).toEqual(
      { phase: 'error', message: 'No signal.' },
    );
    expect(quickVoiceReportReducer(listeningForYesNo, { type: 'file-succeeded' })).toBe(
      listeningForYesNo,
    );
  });

  it('stops with an error when the microphone is unavailable', () => {
    expect(
      quickVoiceReportReducer(
        { phase: 'capturing-wait' },
        { type: 'capture-failed', message: 'Microphone access is off.' },
      ),
    ).toEqual({ phase: 'error', message: 'Microphone access is off.' });
    const filing: QuickVoiceReportState = { phase: 'filing', kind: 'traffic' };
    expect(quickVoiceReportReducer(filing, { type: 'capture-failed', message: 'x' })).toBe(filing);
  });

  it('ignores a second start while a report is in progress', () => {
    expect(quickVoiceReportReducer(listeningForYesNo, { type: 'start', kind: 'parking' })).toBe(
      listeningForYesNo,
    );
  });

  it('starts fresh from a finished report', () => {
    const filed: QuickVoiceReportState = { phase: 'filed', kind: 'traffic' };
    expect(quickVoiceReportReducer(filed, { type: 'start', kind: 'traffic' })).toEqual({
      phase: 'asking-wait',
    });
  });
});

describe('quickVoiceReportReducer — reset', () => {
  it('cancelling while listening ends as not-filed', () => {
    expect(quickVoiceReportReducer({ phase: 'capturing-wait' }, { type: 'reset' })).toEqual({
      phase: 'not-filed',
      kind: 'traffic',
    });
    expect(
      quickVoiceReportReducer(
        { phase: 'capturing-confirmation', kind: 'parking' },
        { type: 'reset' },
      ),
    ).toEqual({ phase: 'not-filed', kind: 'parking' });
  });

  it('otherwise returns to idle', () => {
    expect(quickVoiceReportReducer({ phase: 'filed', kind: 'traffic' }, { type: 'reset' })).toEqual(
      INITIAL_QUICK_VOICE_REPORT_STATE,
    );
  });
});

describe('helpers', () => {
  it('confirmationPrompt', () => {
    expect(confirmationPrompt('traffic', 60)).toBe(
      "Traffic, about 60 minutes' wait, here. Report it?",
    );
    expect(confirmationPrompt('parking')).toBe('Mark a safe place to park here?');
  });

  it('outcomeMessage', () => {
    expect(outcomeMessage({ phase: 'filed', kind: 'traffic' })).toBe('Traffic reported.');
    expect(outcomeMessage({ phase: 'filed', kind: 'parking' })).toBe('Parking marked.');
    expect(outcomeMessage({ phase: 'not-filed', kind: 'parking' })).toBe('Not reported.');
    expect(outcomeMessage({ phase: 'undone', kind: 'parking' })).toBe('Parking removed.');
    expect(outcomeMessage({ phase: 'error', message: 'No signal.' })).toBe('No signal.');
    expect(outcomeMessage({ phase: 'asking-wait' })).toBeUndefined();
  });

  it('activeKind', () => {
    expect(activeKind({ phase: 'idle' })).toBeUndefined();
    expect(activeKind({ phase: 'asking-wait' })).toBe('traffic');
    expect(activeKind({ phase: 'capturing-wait' })).toBe('traffic');
    expect(activeKind({ phase: 'capturing-confirmation', kind: 'parking' })).toBe('parking');
    expect(activeKind({ phase: 'error', message: 'x' })).toBeUndefined();
  });

  it('isListening / isBusy', () => {
    expect(isListening({ phase: 'capturing-wait' })).toBe(true);
    expect(isListening({ phase: 'capturing-confirmation', kind: 'parking' })).toBe(true);
    expect(isListening({ phase: 'idle' })).toBe(false);
    expect(isBusy({ phase: 'asking-wait' })).toBe(true);
    expect(isBusy({ phase: 'confirming', kind: 'parking', prompt: 'x' })).toBe(true);
    expect(isBusy({ phase: 'filing', kind: 'traffic' })).toBe(true);
    expect(isBusy({ phase: 'filed', kind: 'traffic' })).toBe(false);
  });
});
