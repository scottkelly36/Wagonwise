import type { OtpSender } from '../application/ports/otp-sender.js';

const DEFAULT_CLICKSEND_URL = 'https://rest.clicksend.com/v3/sms/send';

// Same shape/precision as domain/identifier.ts's own PHONE_RE — repeated here rather than
// imported (infrastructure/ may not reach into domain/ from a sibling module's shared internals,
// and this adapter only needs "is this a phone number", not full normalisation).
const PHONE_RE = /^\+?\d{8,15}$/;

interface ClickSendResponse {
  readonly response_code: string;
  readonly response_msg: string;
}

function isClickSendResponse(body: unknown): body is ClickSendResponse {
  return (
    typeof body === 'object' &&
    body !== null &&
    'response_code' in body &&
    typeof body.response_code === 'string'
  );
}

/**
 * Real OTP delivery via ClickSend's SMS API — the adapter `docs/progress.md` has flagged as
 * missing since M1.5 (`ConsoleOtpSender` is dev-only, useless for a driver who isn't watching
 * this process's stdout). Hand-rolled HTTP, no client library, same "small, well-understood
 * thing" reasoning as `ExpoPushNotifier` (decision 6/51) — one request, one response to check.
 *
 * SMS-only: a driver can sign in with an email or a phone number
 * (`identity/domain/identifier.ts`), but ClickSend's SMS API only reaches the latter. An email
 * identifier throws rather than silently pretending to have sent something — Phase 1 has no
 * email-sending adapter to fall back to, so this deployment's sign-in only works by phone until
 * one exists.
 */
export class ClickSendOtpSender implements OtpSender {
  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly apiUrl: string = DEFAULT_CLICKSEND_URL,
  ) {}

  async send(identifier: string, code: string): Promise<void> {
    if (!PHONE_RE.test(identifier)) {
      throw new Error(
        `ClickSendOtpSender only sends SMS — cannot deliver an OTP to non-phone identifier "${identifier}"`,
      );
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${this.username}:${this.apiKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        messages: [
          {
            to: identifier,
            body: `Your WagonWise sign-in code is ${code}. It expires in 10 minutes.`,
            source: 'wagonwise',
          },
        ],
      }),
    });
    const parsed: unknown = await response.json();

    if (!response.ok || !isClickSendResponse(parsed)) {
      throw new Error(
        `ClickSend SMS API returned ${response.status} with an unrecognised body: ${JSON.stringify(parsed)}`,
      );
    }
    if (parsed.response_code !== 'SUCCESS') {
      throw new Error(`ClickSend SMS API rejected the OTP: ${parsed.response_msg}`);
    }
  }
}
