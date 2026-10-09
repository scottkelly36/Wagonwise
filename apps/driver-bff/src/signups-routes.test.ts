import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerSignupsRoutes } from './signups-routes.js';
import { FakeCoreClient } from './testing/fakes.js';

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const app = Fastify();
  registerSignupsRoutes(app, { coreClient });
  return { app, coreClient };
}

const signup = { email: 'sam@example.com', role: 'driver', consent: true };

describe('signups routes', () => {
  it('forwards a sign-up to core with no token, relaying core as it is', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 204, body: undefined };
    const response = await app.inject({ method: 'POST', url: '/signups', payload: signup });
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({ method: 'POST', path: '/signups' });
    expect(coreClient.calls[0]?.authorization).toBeUndefined();
  });

  it('forwards a removal the same way', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 204, body: undefined };
    const response = await app.inject({
      method: 'POST',
      url: '/signups/remove',
      payload: { email: 'sam@example.com' },
    });
    expect(response.statusCode).toBe(204);
    expect(coreClient.calls[0]).toMatchObject({ method: 'POST', path: '/signups/remove' });
  });

  it('relays core’s refusal, such as a full day', async () => {
    const { app, coreClient } = buildApp();
    coreClient.nextResponse = { status: 429, body: { tag: 'TooManySignups' } };
    const response = await app.inject({ method: 'POST', url: '/signups', payload: signup });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ tag: 'TooManySignups' });
  });

  it('turns away a malformed request locally, without calling core', async () => {
    const { app, coreClient } = buildApp();
    for (const [url, payload] of [
      ['/signups', { nonsense: true }],
      ['/signups', { ...signup, role: 'astronaut' }],
      ['/signups', { ...signup, consent: 'yes' }],
      ['/signups', { ...signup, email: 'x'.repeat(300) }],
      ['/signups/remove', {}],
    ] as const) {
      const response = await app.inject({ method: 'POST', url, payload });
      expect(response.statusCode).toBe(400);
    }
    expect(coreClient.calls).toEqual([]);
  });
});
