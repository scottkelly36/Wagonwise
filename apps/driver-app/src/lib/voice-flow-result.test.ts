import { flowOutcomeSpeech, isFlowResult } from './voice-flow-result';
import type { VoiceReportFlowState } from './voice-report-flow-reducer';

const results: VoiceReportFlowState[] = [
  { phase: 'filed' },
  { phase: 'queued' },
  { phase: 'report-no-speech' },
  { phase: 'error', message: 'Couldn’t work out what you said.' },
];

describe('isFlowResult', () => {
  it('is true once the report has ended, whichever way', () => {
    for (const state of results) expect(isFlowResult(state)).toBe(true);
  });

  it('is false while it is still going, or before it starts', () => {
    expect(isFlowResult({ phase: 'idle' })).toBe(false);
    expect(isFlowResult({ phase: 'capturing-report' })).toBe(false);
    expect(isFlowResult({ phase: 'capturing-confirmation' } as VoiceReportFlowState)).toBe(false);
  });
});

describe('flowOutcomeSpeech', () => {
  it('says how it ended, and says an error as it is written', () => {
    expect(flowOutcomeSpeech({ phase: 'filed' })).toBe('Saved.');
    expect(flowOutcomeSpeech({ phase: 'queued' })).toBe(
      'Saved. It will be sent when you are back online.',
    );
    expect(flowOutcomeSpeech({ phase: 'report-no-speech' })).toBe('I did not hear anything.');
    expect(flowOutcomeSpeech({ phase: 'error', message: 'Nope.' })).toBe('Nope.');
  });

  it('says nothing while it is going', () => {
    expect(flowOutcomeSpeech({ phase: 'idle' })).toBeUndefined();
  });
});
