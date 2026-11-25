import { describe, expect, it } from 'vitest';
import { TRAFFIC_ALERT_EVERY_MS, trafficProblemHandler } from './traffic-alert.js';

function setup(withEmail = true) {
  let t = new Date('2026-11-25T10:00:00Z').getTime();
  const logged: string[] = [];
  const sent: { subject: string; text: string }[] = [];
  const handler = trafficProblemHandler({
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

describe('trafficProblemHandler', () => {
  it('logs every problem and emails the first of each kind, naming what TomTom said', () => {
    const { handler, logged, sent } = setup();
    handler('flow', new Error('TomTom flow answered 403: You do not have enough credits'));
    expect(logged).toEqual(['flow']);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).toBe('Live traffic: TomTom is refusing calls');
    expect(sent[0]?.text).toContain('You do not have enough credits');
  });

  it('does not email the same kind again for six hours, but does for another kind, and after the time', () => {
    const { handler, sent, advance } = setup();
    handler('flow', new Error('x'));
    advance(60 * 60 * 1000);
    handler('flow', new Error('x'));
    expect(sent).toHaveLength(1);
    handler('limit');
    expect(sent).toHaveLength(2);
    expect(sent[1]?.subject).toContain('allowance is used up');
    advance(TRAFFIC_ALERT_EVERY_MS);
    handler('flow', new Error('x'));
    expect(sent).toHaveLength(3);
  });

  it('only logs when there is no alert address, and survives a failing email', async () => {
    const quiet = setup(false);
    quiet.handler('incidents', new Error('x'));
    expect(quiet.logged).toEqual(['incidents']);
    const handler = trafficProblemHandler({
      now: () => new Date(),
      log: () => undefined,
      email: () => Promise.reject(new Error('mail down')),
    });
    expect(() => handler('flow')).not.toThrow();
    await Promise.resolve();
  });
});
