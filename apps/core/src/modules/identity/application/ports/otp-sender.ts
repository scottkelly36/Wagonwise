/**
 * Delivers a one-time code to a driver. Phase 1 has only a console adapter for local dev
 * (infrastructure/console-otp-sender.ts) — a real SMS/email adapter needs a provider account
 * and is deferred until one is chosen (docs/progress.md).
 */
export interface OtpSender {
  send(identifier: string, code: string): Promise<void>;
}
