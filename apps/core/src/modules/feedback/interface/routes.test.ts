import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import { InMemoryFeedbackNoteRepository } from '../application/testing/in-memory-feedback-note-repository.js';
import { registerFeedbackRoutes, type FeedbackRouteDeps } from './routes.js';

const now = new Date('2026-06-15T08:00:00.000Z');

// `driverId` comes from `request.driverId` (host/driver-auth.ts's hook), never a body or query
// field. This suite stands in for that hook with a trivial test-only header, the same convention
// routing's/hazards' own routes.test.ts use.
const DRIVER_HEADER = 'x-test-driver-id';
const ADMIN = 'staff-admin';

function buildApp(): { app: FastifyInstance; deps: FeedbackRouteDeps } {
  const repo = new InMemoryFeedbackNoteRepository();
  const deps: FeedbackRouteDeps = {
    submitFeedback: { repo, clock: new FakeClock(now), ids: new SequentialIdGenerator() },
    review: {
      repo,
      clock: new FakeClock(now),
      labels: {
        labelsFor: (ids) =>
          Promise.resolve(
            new Map(ids.filter((id) => id === 'driver-1').map((id) => [id, 'Sam Carter'])),
          ),
      },
    },
    callerDirectory: {
      getCaller: (id) => Promise.resolve(id === ADMIN ? { kind: 'platform' } : null),
    },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
    }
    const staffId = request.headers['x-test-staff-id'];
    if (typeof staffId === 'string') {
      request.staffId = staffId;
    }
    done();
  });
  registerFeedbackRoutes(app, deps);
  return { app, deps };
}

function asDriver(driverId: string): { headers: Record<string, string> } {
  return { headers: { [DRIVER_HEADER]: driverId } };
}

describe('POST /feedback/notes', () => {
  it('201s and returns the created note', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/feedback/notes',
      payload: {
        message: 'The route to Corbridge avoided a bridge that was fine.',
        appVersion: '1.0.0',
        deviceInfo: 'ios 17.2',
      },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      driverId: 'driver-1',
      message: 'The route to Corbridge avoided a bridge that was fine.',
      appVersion: '1.0.0',
      deviceInfo: 'ios 17.2',
    });
  });

  it('401s with no authenticated driver', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/feedback/notes',
      payload: { message: 'Feedback', appVersion: '1.0.0', deviceInfo: 'ios 17.2' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: 'unauthenticated' });
  });

  it('400s a malformed body', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/feedback/notes',
      payload: { nonsense: true },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
  });

  it('400s a blank message caught by the use case', async () => {
    const { app } = buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/feedback/notes',
      payload: { message: '   ', appVersion: '1.0.0', deviceInfo: 'ios 17.2' },
      ...asDriver('driver-1'),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ tag: 'InvalidMessage' });
  });
});

describe('staff reading feedback', () => {
  const staff = { headers: { 'x-test-staff-id': ADMIN } };
  const send = (app: FastifyInstance, driver: string, message: string) =>
    app.inject({
      method: 'POST',
      url: '/feedback/notes',
      payload: { message, appVersion: '1.2.1', deviceInfo: 'android 14' },
      ...asDriver(driver),
    });
  const list = async (app: FastifyInstance, status = '') =>
    (await app.inject({ method: 'GET', url: `/staff/feedback${status}`, ...staff })).json<{
      counts: { open: number; resolved: number };
      notes: { id: string; message: string; from?: string; resolvedAt?: string }[];
    }>();

  it('lists what drivers sent with who sent it, never the account id, and marks it resolved and open again', async () => {
    const { app } = buildApp();
    await send(app, 'driver-1', 'Route avoided a fine bridge');
    await send(app, 'driver-2', 'Lovely app');

    const open = await list(app);
    expect(open.counts).toEqual({ open: 2, resolved: 0 });
    const first = open.notes.find((n) => n.message === 'Route avoided a fine bridge');
    expect(first).toMatchObject({ from: 'Sam Carter' });
    expect(JSON.stringify(open)).not.toContain('driver-1');
    // A sender with no name or address on record has no label.
    expect(open.notes.find((n) => n.message === 'Lovely app')?.from).toBeUndefined();

    const resolve = (resolved: boolean) =>
      app.inject({
        method: 'PUT',
        url: `/staff/feedback/${first?.id}/resolved`,
        payload: { resolved },
        ...staff,
      });
    expect((await resolve(true)).statusCode).toBe(204);
    expect((await list(app)).notes.map((n) => n.message)).toEqual(['Lovely app']);
    const resolvedList = await list(app, '?status=resolved');
    expect(resolvedList.notes.map((n) => n.message)).toEqual(['Route avoided a fine bridge']);
    expect(resolvedList.notes[0]?.resolvedAt).toBe(now.toISOString());
    expect(resolvedList.counts).toEqual({ open: 1, resolved: 1 });
    expect((await list(app, '?status=all')).notes).toHaveLength(2);

    expect((await resolve(false)).statusCode).toBe(204);
    expect((await list(app)).counts).toEqual({ open: 2, resolved: 0 });
  });

  it('401s with no staff sign-in, 403s anyone but WagonWise staff, 404s an unknown note, 400s a bad request', async () => {
    const { app } = buildApp();
    const id = '33333333-3333-4333-8333-333333333333';
    expect((await app.inject({ method: 'GET', url: '/staff/feedback' })).statusCode).toBe(401);
    const other = { headers: { 'x-test-staff-id': 'someone' } };
    expect((await app.inject({ method: 'GET', url: '/staff/feedback', ...other })).statusCode).toBe(
      403,
    );
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/staff/feedback/${id}/resolved`,
          payload: { resolved: true },
          ...other,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/staff/feedback/${id}/resolved`,
          payload: { resolved: true },
          ...staff,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/staff/feedback?status=nonsense', ...staff }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/staff/feedback/${id}/resolved`,
          payload: { resolved: 'yes' },
          ...staff,
        })
      ).statusCode,
    ).toBe(400);
  });
});
