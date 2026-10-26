const DEFAULT_CLICKSEND_URL = 'https://rest.clicksend.com/v3/sms/send';
const PHONE_RE = /^\+?\d{8,15}$/;

/**
 * Sends one ordinary text message through ClickSend (the same account that sends sign-in codes). For messages that are not a
 * sign-in code, such as maintenance reminders. Throws when the number is not a phone number or ClickSend refuses, so a caller can
 * fall back to something else rather than think it has been sent.
 */
export class ClickSendTextSender {
  constructor(
    private readonly username: string,
    private readonly apiKey: string,
    private readonly apiUrl: string = DEFAULT_CLICKSEND_URL,
  ) {}

  async send(to: string, message: string): Promise<void> {
    if (!PHONE_RE.test(to)) throw new Error('ClickSendTextSender: not a phone number');
    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${this.username}:${this.apiKey}`).toString('base64')}`,
      },
      body: JSON.stringify({ messages: [{ to, body: message, source: 'wagonwise' }] }),
    });
    const parsed = (await response.json().catch(() => undefined)) as
      { response_code?: unknown; response_msg?: unknown } | undefined;
    if (!response.ok || parsed === undefined || typeof parsed.response_code !== 'string') {
      throw new Error(`ClickSend SMS API returned ${response.status}`);
    }
    if (parsed.response_code !== 'SUCCESS') {
      throw new Error(`ClickSend SMS API rejected the text: ${String(parsed.response_msg)}`);
    }
  }
}
