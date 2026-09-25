import type { OtpSender } from '../application/ports/otp-sender.js';

// Same shape as domain/identifier.ts's own EMAIL_RE — repeated here rather than imported, same
// "small, well-understood thing" precedent as clicksend-otp-sender.ts's own PHONE_RE.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * A driver signs in with either an email or a phone number (`identity/domain/identifier.ts`) —
 * this is what picks which underlying `OtpSender` actually delivers the code, so
 * `request-otp.ts` and the composition root don't need to know there are two channels.
 * `ClickSendOtpSender` and `ResendOtpSender` each guard their own channel and throw on the
 * other identifier shape, but this router means that guard should never actually fire in
 * practice — it stays as a fail-loud safety net, not the primary dispatch mechanism.
 */
export class ChannelRoutingOtpSender implements OtpSender {
  constructor(
    private readonly smsSender: OtpSender,
    private readonly emailSender: OtpSender,
  ) {}

  send(identifier: string, code: string): Promise<void> {
    const sender = EMAIL_RE.test(identifier) ? this.emailSender : this.smsSender;
    return sender.send(identifier, code);
  }
}
