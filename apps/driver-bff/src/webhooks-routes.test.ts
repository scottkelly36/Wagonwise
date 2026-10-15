import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeCoreClient } from './testing/fakes.js';
import { registerWebhooksRoutes } from './webhooks-routes.js';

const secretBytes = Buffer.from('a-test-signing-secret-of-some-length');
const secret = `whsec_${secretBytes.toString('base64')}`;
const now = 1_792_000_000;

function buildApp(configuredSecret: string | null = secret): {
  app: FastifyInstance;
  coreClient: FakeCoreClient;
} {
  const coreClient = new FakeCoreClient();
  const app = Fastify();
  registerWebhooksRoutes(app, {
    coreClient,
    resendWebhookSecret: configuredSecret ?? undefined,
    nowSeconds: () => now,
  });
  return { app, coreClient };
}

function signed(event: unknown, overrides: { signature?: string; timestamp?: number } = {}) {
  const body = JSON.stringify(event);
  const timestamp = overrides.timestamp ?? now;
  const signature =
    overrides.signature ??
    `v1,${createHmac('sha256', secretBytes).update(`msg_1.${timestamp}.${body}`).digest('base64')}`;
  return {
    method: 'POST' as const,
    url: '/webhooks/resend',
    headers: {
      'content-type': 'application/json',
      'svix-id': 'msg_1',
      'svix-timestamp': String(timestamp),
      'svix-signature': signature,
    },
    payload: body,
  };
}

const bounced = {
  type: 'email.bounced',
  data: {
    email_id: 'em_1',
    to: ['dave@gmail.com'],
    bounce: { type: 'Permanent', message: 'The mailbox does not exist' },
  },
};

describe('POST /webhooks/resend', () => {
  it('passes a signed bounce to core, with the addresses, id and reason', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject(signed(bounced));
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls).toHaveLength(1);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/email-events',
      body: {
        type: 'email.bounced',
        emailId: 'em_1',
        recipients: ['dave@gmail.com'],
        reason: 'The mailbox does not exist',
      },
    });
  });

  it('reads the reason of a failed email, and a single recipient given as text', async () => {
    const { app, coreClient } = buildApp();
    await app.inject(
      signed({
        type: 'email.failed',
        data: {
          email_id: 'em_2',
          to: 'sam@example.com',
          failed: { reason: 'Sending limit reached' },
        },
      }),
    );
    expect(coreClient.calls[0]?.body).toMatchObject({
      type: 'email.failed',
      recipients: ['sam@example.com'],
      reason: 'Sending limit reached',
    });
  });

  it('refuses an unsigned or wrongly signed request and reads nothing', async () => {
    const { app, coreClient } = buildApp();
    const wrong = await app.inject(signed(bounced, { signature: 'v1,AAAA' }));
    expect(wrong.statusCode).toBe(401);
    const old = await app.inject(signed(bounced, { timestamp: now - 3600 }));
    expect(old.statusCode).toBe(401);
    const bare = await app.inject({ method: 'POST', url: '/webhooks/resend', payload: bounced });
    expect(bare.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it('acknowledges and drops an event that is not a problem', async () => {
    const { app, coreClient } = buildApp();
    const response = await app.inject(
      signed({ type: 'email.delivered', data: { email_id: 'em_3' } }),
    );
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls).toEqual([]);
  });

  it('says it is not set up when there is no signing secret', async () => {
    const { app, coreClient } = buildApp(null);
    const response = await app.inject(signed(bounced));
    expect(response.statusCode).toBe(503);
    expect(coreClient.calls).toEqual([]);
  });

  it('answers 502 when core fails, so Resend sends it again, but not when core merely refuses', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 500, body: { error: 'oops' } };
    expect((await app.inject(signed(bounced))).statusCode).toBe(502);
    coreClient.nextResponse = { status: 400, body: { error: 'invalid_request' } };
    expect((await app.inject(signed(bounced))).statusCode).toBe(204);
  });
});
