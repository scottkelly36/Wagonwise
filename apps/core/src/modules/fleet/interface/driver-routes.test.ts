import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import {
  InMemoryCompanyCodeRepository,
  InMemoryDriverLinkRepository,
} from '../application/testing/in-memory-driver-links.js';
import { SlidingWindowAttemptLimiter } from '../application/sliding-window-attempt-limiter.js';
import { registerFleetDriverRoutes } from './driver-routes.js';

const ACME = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const PAT = 'pat-driver';
const SAM = 'sam-driver';
const IDENTITIES: Record<string, string> = {
  [PAT]: 'pat@example.com',
  [SAM]: 'sam@example.com',
};

async function build() {
  const links = new InMemoryDriverLinkRepository();
  const codes = new InMemoryCompanyCodeRepository();
  await codes.save(ACME, 'ABCD2345');
  const scopes = new RecordingDataScopes();
  const ids = new SequentialIdGenerator();
  const clock = new FakeClock();
  const app: FastifyInstance = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driver = request.headers['x-test-driver-id'];
    if (typeof driver === 'string') request.driverId = driver;
    done();
  });
  registerFleetDriverRoutes(app, {
    links,
    joinWithCode: { links, codes, ids, clock, limiter: new SlidingWindowAttemptLimiter(clock) },
    respond: { links, ids, clock },
    settle: { links, ids, clock },
    identities: { getIdentifier: (id) => Promise.resolve(IDENTITIES[id] ?? null) },
    companyNames: { namesFor: () => Promise.resolve(new Map([[ACME, 'Acme Haulage']])) },
    dataScopes: scopes,
  });
  return { app, links, scopes };
}

const as = (driver: string) => ({ headers: { 'x-test-driver-id': driver } });

describe('driver fleet routes', () => {
  it('401s without a signed-in driver, and for a driver with no identifier', async () => {
    const { app } = await build();
    expect((await app.inject({ method: 'GET', url: '/fleet/links' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/fleet/links', ...as('ghost') })).statusCode,
    ).toBe(401);
  });

  it('joins with a code, showing the company name, and runs in the driver scope', async () => {
    const { app, scopes } = await build();
    const joined = await app.inject({
      method: 'POST',
      url: '/fleet/links/join',
      payload: { code: 'abcd-2345' },
      ...as(PAT),
    });
    expect(joined.statusCode).toBe(201);
    expect(joined.json()).toMatchObject({ status: 'requested', companyName: 'Acme Haulage' });
    expect(scopes.used).toEqual([{ kind: 'driver', driverId: PAT, identifier: 'pat@example.com' }]);
    const mine = await app.inject({ method: 'GET', url: '/fleet/links', ...as(PAT) });
    expect(mine.json<{ links: unknown[] }>().links).toHaveLength(1);
  });

  it('shows an invitation to the person it was made for, who can accept it', async () => {
    const { app, links } = await build();
    await links.save({
      id: makeId<'DriverLinkId'>('22222222-2222-4222-8222-222222222222'),
      companyId: ACME,
      invitedIdentifier: 'sam@example.com',
      status: 'invited',
      createdAt: new Date(),
    });
    const pat = await app.inject({ method: 'GET', url: '/fleet/links', ...as(PAT) });
    expect(pat.json<{ links: unknown[] }>().links).toEqual([]);
    const sam = await app.inject({ method: 'GET', url: '/fleet/links', ...as(SAM) });
    const [invite] = sam.json<{ links: { id: string; companyName: string }[] }>().links;
    expect(invite?.companyName).toBe('Acme Haulage');

    const accepted = await app.inject({
      method: 'POST',
      url: `/fleet/links/${invite?.id}/respond`,
      payload: { accept: true },
      ...as(SAM),
    });
    expect(accepted.json()).toMatchObject({ status: 'active' });
    const left = await app.inject({
      method: 'POST',
      url: `/fleet/links/${invite?.id}/leave`,
      ...as(SAM),
    });
    expect(left.json()).toMatchObject({ status: 'left' });
  });

  it('404s answering or leaving someone else’s link, and 400s a bad body', async () => {
    const { app } = await build();
    const joined = await app.inject({
      method: 'POST',
      url: '/fleet/links/join',
      payload: { code: 'ABCD2345' },
      ...as(PAT),
    });
    const { id } = joined.json<{ id: string }>();
    const leave = await app.inject({ method: 'POST', url: `/fleet/links/${id}/leave`, ...as(SAM) });
    expect(leave.statusCode).toBe(404);
    const bad = await app.inject({
      method: 'POST',
      url: `/fleet/links/${id}/respond`,
      payload: { accept: 'yes' },
      ...as(PAT),
    });
    expect(bad.statusCode).toBe(400);
  });

  it('answers a wrong code with 400, and 429 after too many', async () => {
    const { app } = await build();
    const wrong = () =>
      app.inject({
        method: 'POST',
        url: '/fleet/links/join',
        payload: { code: 'ZZZZ2222' },
        ...as(PAT),
      });
    for (let i = 0; i < 5; i += 1) expect((await wrong()).statusCode).toBe(400);
    const blocked = await wrong();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ tag: 'TooManyAttempts' });
  });
});
