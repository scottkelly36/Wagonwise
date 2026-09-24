import type { ParsedVoiceHazardReportDto } from '@wagonwise/contracts/hazards';

import {
  INITIAL_VOICE_REPORT_FLOW_STATE,
  voiceReportFlowReducer,
  type VoiceReportFlowState,
} from './voice-report-flow-reducer';

const origin = { lat: 54.9707, lon: -2.1013 };
const parsed: ParsedVoiceHazardReportDto = { type: 'low_bridge' };

describe('voiceReportFlowReducer', () => {
  it('starts idle', () => {
    expect(INITIAL_VOICE_REPORT_FLOW_STATE).toEqual({ phase: 'idle' });
  });

  it('start begins capturing the report', () => {
    expect(voiceReportFlowReducer({ phase: 'idle' }, { type: 'start' })).toEqual({
      phase: 'capturing-report',
    });
  });

  it('a report transcript moves to parsing, keeping the transcript and origin', () => {
    expect(
      voiceReportFlowReducer(
        { phase: 'capturing-report' },
        { type: 'report-transcript', transcript: 'low bridge ahead', origin },
      ),
    ).toEqual({ phase: 'parsing', transcript: 'low bridge ahead', origin });
  });

  it('report-no-speech moves to report-no-speech', () => {
    expect(
      voiceReportFlowReducer({ phase: 'capturing-report' }, { type: 'report-no-speech' }),
    ).toEqual({ phase: 'report-no-speech' });
  });

  it('a report capture failure moves to error', () => {
    expect(
      voiceReportFlowReducer(
        { phase: 'capturing-report' },
        { type: 'report-capture-failed', message: 'Microphone access is off' },
      ),
    ).toEqual({ phase: 'error', message: 'Microphone access is off' });
  });

  it('parse-succeeded moves to speaking-summary, carrying the transcript, origin, parsed result and summary', () => {
    const parsing: VoiceReportFlowState = { phase: 'parsing', transcript: 'low bridge', origin };
    expect(
      voiceReportFlowReducer(parsing, {
        type: 'parse-succeeded',
        parsed,
        summary: 'Low bridge, here — save it?',
      }),
    ).toEqual({
      phase: 'speaking-summary',
      transcript: 'low bridge',
      origin,
      parsed,
      summary: 'Low bridge, here — save it?',
    });
  });

  it('parse-succeeded is ignored outside the parsing phase', () => {
    const idle: VoiceReportFlowState = { phase: 'idle' };
    expect(voiceReportFlowReducer(idle, { type: 'parse-succeeded', parsed, summary: 'x' })).toEqual(
      idle,
    );
  });

  it('parse-failed moves to error', () => {
    expect(
      voiceReportFlowReducer(
        { phase: 'parsing', transcript: 'x', origin },
        { type: 'parse-failed', message: "Couldn't understand that" },
      ),
    ).toEqual({ phase: 'error', message: "Couldn't understand that" });
  });

  it('speech-done moves to capturing-confirmation, carrying the parsed result forward', () => {
    const speaking: VoiceReportFlowState = {
      phase: 'speaking-summary',
      transcript: 'low bridge',
      origin,
      parsed,
      summary: 'Low bridge, here — save it?',
    };
    expect(voiceReportFlowReducer(speaking, { type: 'speech-done' })).toEqual({
      phase: 'capturing-confirmation',
      transcript: 'low bridge',
      origin,
      parsed,
    });
  });

  it('speech-done is ignored outside the speaking-summary phase', () => {
    const idle: VoiceReportFlowState = { phase: 'idle' };
    expect(voiceReportFlowReducer(idle, { type: 'speech-done' })).toEqual(idle);
  });

  it('confirmation-yes moves to filing, using the origin the event carries', () => {
    const confirming: VoiceReportFlowState = {
      phase: 'capturing-confirmation',
      transcript: 'low bridge',
      origin,
      parsed,
    };
    expect(voiceReportFlowReducer(confirming, { type: 'confirmation-yes', origin })).toEqual({
      phase: 'filing',
      parsed,
      origin,
    });
  });

  it('confirmation-yes is ignored outside the capturing-confirmation phase', () => {
    const idle: VoiceReportFlowState = { phase: 'idle' };
    expect(voiceReportFlowReducer(idle, { type: 'confirmation-yes', origin })).toEqual(idle);
  });

  it('confirmation-declined moves to draft-saved, keeping the transcript and parsed result', () => {
    expect(
      voiceReportFlowReducer(
        { phase: 'capturing-confirmation', transcript: 'low bridge ahead', origin, parsed },
        { type: 'confirmation-declined' },
      ),
    ).toEqual({ phase: 'draft-saved', transcript: 'low bridge ahead', parsed });
  });

  it('confirmation-declined is ignored outside the capturing-confirmation phase', () => {
    const idle: VoiceReportFlowState = { phase: 'idle' };
    expect(voiceReportFlowReducer(idle, { type: 'confirmation-declined' })).toEqual(idle);
  });

  it('file-succeeded moves to filed', () => {
    expect(
      voiceReportFlowReducer({ phase: 'filing', parsed, origin }, { type: 'file-succeeded' }),
    ).toEqual({ phase: 'filed' });
  });

  it('file-failed moves to queued — the report is safely persisted, only sending is delayed', () => {
    expect(
      voiceReportFlowReducer({ phase: 'filing', parsed, origin }, { type: 'file-failed' }),
    ).toEqual({ phase: 'queued' });
  });

  it('reset returns to idle from any phase', () => {
    expect(voiceReportFlowReducer({ phase: 'filed' }, { type: 'reset' })).toEqual({
      phase: 'idle',
    });
  });
});
