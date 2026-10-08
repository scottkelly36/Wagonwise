import type { InviteMailer } from '../application/ports/invite-mailer.js';

const DATE = new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeZone: 'Europe/London' });

/**
 * `InviteMailer` over identity's facade (`IdentityModule.sendEmail`), passed in as a plain function so
 * this module never imports identity (AGENTS.md rules 6-7). The composition root connects the two.
 */
export class IdentityInviteMailer implements InviteMailer {
  constructor(
    private readonly sendEmail: (to: string, subject: string, text: string) => Promise<void>,
  ) {}

  send(invite: {
    readonly to: string;
    readonly name: string;
    readonly link: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    const text = [
      `Hi ${invite.name},`,
      '',
      'You have been invited to WagonWise. Open this link to choose a password and set up your sign-in:',
      '',
      invite.link,
      '',
      `The link works once and expires on ${DATE.format(invite.expiresAt)}. If you were not expecting this, you can ignore this email.`,
      '',
      'WagonWise',
    ].join('\n');
    return this.sendEmail(invite.to, 'You have been invited to WagonWise', text);
  }
}
