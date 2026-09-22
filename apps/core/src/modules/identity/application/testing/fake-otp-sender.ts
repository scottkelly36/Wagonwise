import type { OtpSender } from '../ports/otp-sender.js';

export interface SentOtp {
  readonly identifier: string;
  readonly code: string;
}

export class FakeOtpSender implements OtpSender {
  readonly sent: SentOtp[] = [];

  send(identifier: string, code: string): Promise<void> {
    this.sent.push({ identifier, code });
    return Promise.resolve();
  }
}
