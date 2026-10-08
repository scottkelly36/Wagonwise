import type { OtpSender } from '../application/ports/otp-sender.js';
import { ResendMailer } from './resend-mailer.js';

// Same shape as domain/identifier.ts's own EMAIL_RE — repeated here rather than imported, same
// "small, well-understood thing" precedent as clicksend-otp-sender.ts's own PHONE_RE.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Real OTP delivery via Resend's email API — the other half of the `OtpSender` gap
 * (`clicksend-otp-sender.ts` covers SMS). The sending itself is `ResendMailer`.
 *
 * Email-only: a driver can sign in with an email or a phone number
 * (`identity/domain/identifier.ts`), but this only reaches the former — `ChannelRoutingOtpSender`
 * is what picks between this and `ClickSendOtpSender`, so callers never send the wrong identifier
 * type here in practice, but the guard stays as a fail-loud safety net either way.
 */
export class ResendOtpSender implements OtpSender {
  readonly #mailer: ResendMailer;

  constructor(apiKey: string, from?: string, apiUrl?: string) {
    this.#mailer = new ResendMailer(apiKey, from, apiUrl);
  }

  async send(identifier: string, code: string): Promise<void> {
    if (!EMAIL_RE.test(identifier)) {
      throw new Error(
        `ResendOtpSender only sends email — cannot deliver an OTP to non-email identifier "${identifier}"`,
      );
    }
    await this.#mailer.send({
      to: identifier,
      subject: 'Your WagonWise sign-in code',
      text: `Your WagonWise sign-in code is ${code}. It expires in 10 minutes.`,
    });
  }
}
