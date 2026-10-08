const DEFAULT_RESEND_URL = 'https://api.resend.com/emails';
// Resend's own sandbox sender: works with zero domain setup, but only delivers to the account owner's
// own address. Set `RESEND_FROM_EMAIL` to an address on a domain verified in Resend to reach anyone else.
export const DEFAULT_FROM = 'WagonWise <onboarding@resend.dev>';

interface ResendResponse {
  readonly id: string;
}

function isResendResponse(body: unknown): body is ResendResponse {
  return typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string';
}

export interface PlainEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/** Sends one plain-text email through Resend's API. Hand-rolled HTTP, like the other adapters. Throws,
 *  with Resend's own message in it, when Resend refuses, so the log says why. */
export class ResendMailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string = DEFAULT_FROM,
    private readonly apiUrl: string = DEFAULT_RESEND_URL,
  ) {}

  async send(email: PlainEmail): Promise<void> {
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: email.to,
        subject: email.subject,
        text: email.text,
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
