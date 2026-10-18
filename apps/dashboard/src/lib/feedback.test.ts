import { describe, expect, it } from 'vitest';
import { feedbackSearchText, isResolved, sentFrom } from './feedback';

const note = {
  id: 'n1',
  message: 'Route avoided a bridge that was fine',
  appVersion: '1.2.1',
  deviceInfo: 'android 14',
  createdAt: '2026-10-17T09:00:00.000Z',
  from: 'Sam Carter',
};

describe('feedback helpers', () => {
  it('says where a note came from in one line', () => {
    expect(sentFrom(note)).toBe('android 14 · app 1.2.1');
  });

  it('searches the message, the sender and the phone', () => {
    const text = feedbackSearchText(note);
    expect(text).toContain('bridge');
    expect(text).toContain('Sam Carter');
    expect(text).toContain('android');
    expect(feedbackSearchText({ ...note, from: undefined })).not.toContain('undefined');
  });

  it('tells resolved from open', () => {
    expect(isResolved({})).toBe(false);
    expect(isResolved({ resolvedAt: '2026-10-18T09:00:00.000Z' })).toBe(true);
  });
});
