import type { EmailProblem } from '@wagonwise/contracts/email-events';
import { maskAddress } from '../domain/mask-address.js';

/** Sends the alert to the owner. Composition supplies it over the same email sender that carries sign-in codes. */
export interface AlertMailer {
  send(subject: string, text: string): Promise<void>;
}

/** A cap on alert emails, so a bad hour is one worry and not a hundred messages. */
export interface AlertLimiter {
  /** Whether another alert may go now; counts it if so. */
  tryAcquire(): boolean;
}

export interface ReportEmailProblemDeps {
  /** Absent when no alert address is set: the problem is only logged. */
  readonly mailer?: AlertMailer | undefined;
  /** The address alerts go to, so a failed alert is never alerted about again. */
  readonly alertAddress?: string | undefined;
  readonly limiter: AlertLimiter;
}

export interface ReportedProblem {
  readonly type: EmailProblem['type'];
  readonly emailId: string;
  /** Masked: safe for a log. */
  readonly recipients: readonly string[];
  readonly reason?: string | undefined;
  readonly alerted: boolean;
}

const WHAT: Record<EmailProblem['type'], string> = {
  'email.failed': 'could not be sent',
  'email.bounced': 'bounced (the address refused it)',
  'email.complained': 'was marked as spam by the person who got it',
  'email.suppressed': 'was not sent because the address is on Resend’s suppression list',
};

/**
 * An email did not get through. Always reported back (masked) so the caller can log it; the owner is also emailed unless
 * there is no alert address, the email was itself an alert, or the hourly cap is reached. A failed alert is swallowed:
 * answering with an error would only make Resend send the same event again.
 */
export async function reportEmailProblem(
  deps: ReportEmailProblemDeps,
  problem: EmailProblem,
): Promise<ReportedProblem> {
  const recipients = problem.recipients.map(maskAddress);
  const reported = {
    type: problem.type,
    emailId: problem.emailId,
    recipients,
    ...(problem.reason === undefined ? {} : { reason: problem.reason }),
  };

  const alertAddress = deps.alertAddress?.trim().toLowerCase();
  const wasAnAlert =
    alertAddress !== undefined &&
    problem.recipients.some((r) => r.trim().toLowerCase() === alertAddress);
  if (deps.mailer === undefined || wasAnAlert || !deps.limiter.tryAcquire()) {
    return { ...reported, alerted: false };
  }

  const to = recipients.length === 0 ? 'an unknown address' : recipients.join(', ');
  const text = [
    `An email from WagonWise to ${to} ${WHAT[problem.type]}.`,
    problem.reason === undefined ? undefined : `Reason: ${problem.reason}`,
    `Resend email id: ${problem.emailId} (open it in the Resend dashboard, Emails, for the full address and detail).`,
    'A sign-in code may not have reached a driver or a staff member. If it keeps happening, check the Resend dashboard.',
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n\n');
  try {
    await deps.mailer.send(`WagonWise: an email ${WHAT[problem.type]}`, text);
    return { ...reported, alerted: true };
  } catch {
    return { ...reported, alerted: false };
  }
}
