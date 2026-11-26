import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerTachographRoutes } from './tachograph-routes.js';
import { FakeAccessTokenVerifier, FakeCoreClient } from './testing/fakes.js';

const VALID_TOKEN = 'a-real-token';
const AUTH = { authorization: `Bearer ${VALID_TOKEN}` };
const COMPANY = '11111111-1111-4111-8111-111111111111';
const file = {
  fileName: 'C_sam.DDD',
  downloadedOn: '2026-11-20',
  dataBase64: 'AAEC',
  wordingVersion: 1,
};

function buildApp(): { app: FastifyInstance; coreClient: FakeCoreClient } {
  const coreClient = new FakeCoreClient();
  const verifier = new FakeAccessTokenVerifier();
  verifier.claimsByToken.set(VALID_TOKEN, { driverId: 'driver-1', sessionId: 'session-1' });
  const app = Fastify();
  registerTachographRoutes(app, { coreClient, accessTokenVerifier: verifier });
  return { app, coreClient };
}

const cases = [
  ['GET', '/tachograph/mine', undefined],
  ['POST', `/tachograph/companies/${COMPANY}/files`, file],
] as const;

describe('tachograph routes', () => {
  it.each(cases)('%s %s needs a token, without calling core', async (method, url, payload) => {
    const { app, coreClient } = buildApp();
    const response = await app.inject({
      method,
      url,
      ...(payload === undefined ? {} : { payload }),
    });
    expect(response.statusCode).toBe(401);
    expect(coreClient.calls).toEqual([]);
  });

  it.each(cases)(
    '%s %s forwards to the same core path with the token, relaying core as it is',
    async (method, url, payload) => {
      const { app, coreClient } = buildApp();
      coreClient.nextResponse = { status: 201, body: { relayed: true } };
      const response = await app.inject({
        method,
        url,
        ...(payload === undefined ? {} : { payload }),
        headers: AUTH,
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ relayed: true });
      expect(coreClient.calls[0]).toMatchObject({
        method,
        path: url,
        authorization: `Bearer ${VALID_TOKEN}`,
      });
    },
  );

  it('400s a malformed file locally, without calling core', async () => {
    const { app, coreClient } = buildApp();
    for (const payload of [
      { ...file, downloadedOn: '20/11/2026' },
      { ...file, dataBase64: '' },
      { ...file, fileName: '  ' },
      { fileName: 'x.ddd' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: `/tachograph/companies/${COMPANY}/files`,
        payload,
        headers: AUTH,
      });
      expect(response.statusCode).toBe(400);
    }
    expect(coreClient.calls).toEqual([]);
  });
});
