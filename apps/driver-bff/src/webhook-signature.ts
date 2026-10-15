import { createHmac, timingSafeEqual } from 'node:crypto';

/** How far a webhook's timestamp may be from now, either way. Stops an old captured request being replayed. */
const TOLERANCE_SECONDS = 5 * 60;

export interface SignedWebhookHeaders {
  readonly id: string | undefined;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
}

/**
 * Checks a Resend webhook, which Resend sends through Svix: the signature is a base64 HMAC-SHA256, with the key from the
 * signing secret (`whsec_` plus base64), of `id.timestamp.body`. The header may hold several `v1,<signature>` entries (the
 * secret was rotated); one match is enough. `body` must be the exact text received, not re-serialised JSON.
 */
export function verifyWebhook(input: {
  readonly secret: string;
  readonly headers: SignedWebhookHeaders;
  readonly body: string;
  readonly nowSeconds: number;
}): boolean {
  const { id, timestamp, signature } = input.headers;
  if (id === undefined || timestamp === undefined || signature === undefined) return false;

  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(input.nowSeconds - sent) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(input.secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${input.body}`).digest();

  return signature.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || value === undefined) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
