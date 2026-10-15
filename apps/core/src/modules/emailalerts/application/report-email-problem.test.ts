import { describe, expect, it } from 'vitest';
import { reportEmailProblem, type AlertLimiter, type AlertMailer } from './report-email-problem.js';

const problem = {
  type: 'email.bounced' as const,
  emailId: 'em_123',
  recipients: ['dave.kelly@gmail.com'],
  reason: 'The mailbox does not exist',
};

class RecordingMailer implements AlertMailer {
  readonly sent: { subject: string; text: string }[] = [];
  fail = false;
  send(subject: string, text: string): Promise<void> {
    if (this.fail) return Promise.reject(new Error('provider down'));
    this.sent.push({ subject, text });
    return Promise.resolve();
  }
}

const open: AlertLimiter = { tryAcquire: () => true };
const closed: AlertLimiter = { tryAcquire: () => false };

describe('reportEmailProblem', () => {
  it('emails the owner, with the address masked and the Resend id to look up', async () => {
    const mailer = new RecordingMailer();
    const result = await reportEmailProblem(
      { mailer, alertAddress: 'owner@example.com', limiter: open },
      problem,
    );
    expect(result).toMatchObject({ alerted: true, recipients: ['d***@gmail.com'] });
    expect(mailer.sent).toHaveLength(1);
    const { subject, text } = mailer.sent[0] ?? { subject: '', text: '' };
    expect(subject).toContain('bounced');
    expect(text).toContain('d***@gmail.com');
    expect(text).toContain('em_123');
    expect(text).toContain('The mailbox does not exist');
    expect(text).not.toContain('dave.kelly');
  });

  it('only reports back, with nothing sent, when no alert address is set', async () => {
    const result = await reportEmailProblem({ limiter: open }, problem);
    expect(result).toMatchObject({ alerted: false, recipients: ['d***@gmail.com'] });
  });

  it('does not alert about an email that was itself an alert', async () => {
    const mailer = new RecordingMailer();
    const result = await reportEmailProblem(
      { mailer, alertAddress: 'Owner@Example.com', limiter: open },
      { ...problem, recipients: ['owner@example.com'] },
    );
    expect(result.alerted).toBe(false);
    expect(mailer.sent).toHaveLength(0);
  });

  it('stops alerting at the hourly cap', async () => {
    const mailer = new RecordingMailer();
    const result = await reportEmailProblem(
      { mailer, alertAddress: 'owner@example.com', limiter: closed },
      problem,
    );
    expect(result.alerted).toBe(false);
    expect(mailer.sent).toHaveLength(0);
  });

  it('swallows a failed alert instead of failing the request', async () => {
    const mailer = new RecordingMailer();
    mailer.fail = true;
    const result = await reportEmailProblem(
      { mailer, alertAddress: 'owner@example.com', limiter: open },
      problem,
    );
    expect(result.alerted).toBe(false);
  });
});
