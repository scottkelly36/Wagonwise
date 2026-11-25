import { describe, expect, it } from 'vitest';
import { LIMIT_ALERT_EVERY_MS, limitHandler } from './limit-alert.js';

function setup(withEmail = true) {
  let t = new Date('2026-11-26T10:00:00Z').getTime();
  const logged: string[] = [];
  const sent: { subject: string; text: string }[] = [];
  const handler = limitHandler({
    now: () => new Date(t),
    log: (what) => logged.push(what),
    email: withEmail
      ? (subject, text) => {
          sent.push({ subject, text });
          return Promise.resolve();
        }
      : undefined,
  });
  return { handler, logged, sent, advance: (ms: number) => (t += ms) };
}

describe('limitHandler', () => {
  it('logs every time and emails the first of each kind, saying what to change', () => {
    const { handler, logged, sent } = setup();
    handler('new_accounts');
    handler('texts');
    expect(logged).toEqual(['new_accounts', 'texts']);
    expect(sent.map((m) => m.subject)).toEqual([
      'Sign-up limit reached: new driver accounts are paused until tomorrow',
      'Text message limit reached: sign-in codes by text are paused until tomorrow',
    ]);
    expect(sent[0]?.text).toContain('NEW_DRIVER_DAILY_LIMIT');
    expect(sent[1]?.text).toContain('OTP_SMS_DAILY_LIMIT');
    expect(sent[1]?.text).toContain('Codes by email still work');
  });

  it('does not email the same kind again for six hours, and does after', () => {
    const { handler, sent, advance } = setup();
    handler('texts');
    advance(60 * 60 * 1000);
    handler('texts');
    handler('texts');
    expect(sent).toHaveLength(1);
    advance(LIMIT_ALERT_EVERY_MS);
    handler('texts');
    expect(sent).toHaveLength(2);
  });

  it('only logs with no alert address, and survives a failing email', async () => {
    const quiet = setup(false);
    quiet.handler('texts');
    expect(quiet.logged).toEqual(['texts']);
    const handler = limitHandler({
      now: () => new Date(),
      log: () => undefined,
      email: () => Promise.reject(new Error('mail down')),
    });
    expect(() => handler('texts')).not.toThrow();
    await Promise.resolve();
  });
});
