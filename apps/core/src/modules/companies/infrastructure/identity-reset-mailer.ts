import type { ResetMailer } from '../application/ports/reset-mailer.js';

const TIME = new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Europe/London' });

/** `ResetMailer` over identity's facade (`IdentityModule.sendEmail`), passed in as a plain function so this module never imports identity. */
export class IdentityResetMailer implements ResetMailer {
  constructor(
    private readonly sendEmail: (to: string, subject: string, text: string) => Promise<void>,
  ) {}

  send(reset: {
    readonly to: string;
    readonly name: string;
    readonly link: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    const text = [
      `Hi ${reset.name},`,
      '',
      'Someone asked to choose a new password for your WagonWise account. Open this link to do it:',
      '',
      reset.link,
      '',
      `The link works once and stops working at ${TIME.format(reset.expiresAt)} (UK time). You will still be asked for your usual second check when you sign in.`,
      '',
      'If it was not you, ignore this email: your password stays as it is.',
      '',
      'WagonWise',
    ].join('\n');
    return this.sendEmail(reset.to, 'Choose a new WagonWise password', text);
  }
}
