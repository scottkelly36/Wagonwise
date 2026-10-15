import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhook } from './webhook-signature.js';

const secretBytes = Buffer.from('a-test-signing-secret-of-some-length');
const secret = `whsec_${secretBytes.toString('base64')}`;
const body = '{"type":"email.bounced","data":{"email_id":"em_1"}}';
const now = 1_792_000_000;

function sign(id: string, timestamp: number, text: string, key = secretBytes): string {
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${text}`).digest('base64')}`;
}

const headers = (signature: string, timestamp = now) => ({
  id: 'msg_1',
  timestamp: String(timestamp),
  signature,
});

describe('verifyWebhook', () => {
  it('accepts a correctly signed, recent request', () => {
    expect(
      verifyWebhook({ secret, headers: headers(sign('msg_1', now, body)), body, nowSeconds: now }),
    ).toBe(true);
  });

  it('accepts when any one of several signatures matches (a rotated secret)', () => {
    const old = sign('msg_1', now, body, Buffer.from('an-old-secret'));
    const signature = `${old} ${sign('msg_1', now, body)}`;
    expect(verifyWebhook({ secret, headers: headers(signature), body, nowSeconds: now })).toBe(
      true,
    );
  });

  it('refuses a changed body, a wrong secret, a missing header and a garbled signature', () => {
    const good = sign('msg_1', now, body);
    expect(
      verifyWebhook({ secret, headers: headers(good), body: body + ' ', nowSeconds: now }),
    ).toBe(false);
    expect(
      verifyWebhook({
        secret: `whsec_${Buffer.from('another').toString('base64')}`,
        headers: headers(good),
        body,
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(
      verifyWebhook({
        secret,
        headers: { id: undefined, timestamp: String(now), signature: good },
        body,
        nowSeconds: now,
      }),
    ).toBe(false);
    expect(verifyWebhook({ secret, headers: headers('v1,@@@'), body, nowSeconds: now })).toBe(
      false,
    );
    expect(verifyWebhook({ secret, headers: headers('v2,abc'), body, nowSeconds: now })).toBe(
      false,
    );
  });

  it('refuses a request that is too old or too far ahead', () => {
    const old = now - 6 * 60;
    expect(
      verifyWebhook({
        secret,
        headers: headers(sign('msg_1', old, body), old),
        body,
        nowSeconds: now,
      }),
    ).toBe(false);
    const future = now + 6 * 60;
    expect(
      verifyWebhook({
        secret,
        headers: headers(sign('msg_1', future, body), future),
        body,
        nowSeconds: now,
      }),
    ).toBe(false);
  });
});
