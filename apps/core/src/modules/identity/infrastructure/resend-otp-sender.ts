import type { OtpSender } from '../application/ports/otp-sender.js';

const DEFAULT_RESEND_URL = 'https://api.resend.com/emails';
// Resend's own sandbox sender — works with zero domain setup, but only delivers to the
// account owner's own verified address. Override via config once a real sending domain is
// verified with Resend.
const DEFAULT_FROM = 'WagonWise <onboarding@resend.dev>';

// Same shape as domain/identifier.ts's own EMAIL_RE — repeated here rather than imported, same
// "small, well-understood thing" precedent as clicksend-otp-sender.ts's own PHONE_RE.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResendResponse {
  readonly id: string;
}

function isResendResponse(body: unknown): body is ResendResponse {
  return typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string';
}

/**
 * Real OTP delivery via Resend's email API — the other half of the `OtpSender` gap
 * (`clicksend-otp-sender.ts` covers SMS). Hand-rolled HTTP, same reasoning as every other
 * adapter here (decision 6/51).
 *
 * Email-only: a driver can sign in with an email or a phone number
 * (`identity/domain/identifier.ts`), but this only reaches the former — `ChannelRoutingOtpSender`
 * is what picks between this and `ClickSendOtpSender`, so callers never send the wrong identifier
 * type here in practice, but the guard stays as a fail-loud safety net either way.
 */
export class ResendOtpSender implements OtpSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string = DEFAULT_FROM,
    private readonly apiUrl: string = DEFAULT_RESEND_URL,
  ) {}

  async send(identifier: string, code: string): Promise<void> {
    if (!EMAIL_RE.test(identifier)) {
      throw new Error(
        `ResendOtpSender only sends email — cannot deliver an OTP to non-email identifier "${identifier}"`,
      );
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: identifier,
        subject: 'Your WagonWise sign-in code',
        text: `Your WagonWise sign-in code is ${code}. It expires in 10 minutes.`,
      }),
    });
    const parsed: unknown = await response.json();

    if (!response.ok || !isResendResponse(parsed)) {
      throw new Error(
        `Resend API returned ${response.status} with an unrecognised body: ${JSON.stringify(parsed)}`,
      );
    }
  }
}
