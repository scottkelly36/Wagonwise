import type { OtpSender } from '../application/ports/otp-sender.js';

/**
 * Local-dev-only: logs the code instead of sending it. A real SMS/email adapter needs a
 * provider account and is deferred until one is chosen (docs/progress.md) — this is what
 * `pnpm dev` wires until then, never what a deployment should use.
 */
export class ConsoleOtpSender implements OtpSender {
  send(identifier: string, code: string): Promise<void> {
    console.log(`[dev] OTP for ${identifier}: ${code}`);
    return Promise.resolve();
  }
}
