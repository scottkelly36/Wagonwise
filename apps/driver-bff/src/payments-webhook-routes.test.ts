import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeCoreClient } from './testing/fakes.js';
import { registerWebhooksRoutes } from './webhooks-routes.js';

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const app = Fastify();
  registerWebhooksRoutes(app, {
    coreClient,
    resendWebhookSecret: undefined,
    nowSeconds: () => 1_792_000_000,
  });
  return { app, coreClient };
}

const BODY = JSON.stringify({ id: 'evt_1', type: 'something.happened', data: { id: 'x' } });

const post = (app: FastifyInstance, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: '/webhooks/payments',
    headers: { 'content-type': 'application/json', ...headers },
    payload: BODY,
  });

describe('POST /webhooks/payments', () => {
  it('passes the exact text and the signature on to core, knowing nothing about the provider', async () => {
    const { app, coreClient } = buildApp();
    const response = await post(app, { 'stripe-signature': 't=1,v1=abc' });
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls).toHaveLength(1);
    expect(coreClient.calls[0]).toMatchObject({
      method: 'POST',
      path: '/payments/webhook',
      body: { body: BODY, signature: 't=1,v1=abc' },
    });
  });

  it('passes it on without a signature when there is none, and lets core refuse it', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 401, body: { error: 'invalid_signature' } };
    const response = await post(app);
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls[0]?.body).toEqual({ body: BODY });
  });

  it('answers 502 when core fails, so the provider sends it again, and 400 for a request core refuses', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 500, body: { error: 'oops' } };
    expect((await post(app, { 'x-wagonwise-signature': 's' })).statusCode).toBe(502);
    coreClient.nextResponse = { status: 400, body: { error: 'invalid_request' } };
    expect((await post(app, { 'x-wagonwise-signature': 's' })).statusCode).toBe(400);
  });
});
