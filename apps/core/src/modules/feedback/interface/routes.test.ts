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

function buildApp(): { app: FastifyInstance; deps: FeedbackRouteDeps } {
  const repo = new InMemoryFeedbackNoteRepository();
  const deps: FeedbackRouteDeps = {
    submitFeedback: { repo, clock: new FakeClock(now), ids: new SequentialIdGenerator() },
  };
  const app = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const driverId = request.headers[DRIVER_HEADER];
    if (typeof driverId === 'string') {
      request.driverId = driverId;
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
