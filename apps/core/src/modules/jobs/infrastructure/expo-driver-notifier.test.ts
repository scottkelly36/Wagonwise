import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { DriverMessage } from '../application/ports/notices.js';
import { ExpoDriverNotifier } from './expo-driver-notifier.js';

const driverId = makeId<'DriverId'>('77777777-7777-4777-8777-777777777777');
const message: DriverMessage = {
  title: 'New job assigned',
  body: 'JOB-1: Hexham depot',
  data: { type: 'job_assigned', jobId: 'job-1' },
};

/** A real local HTTP server standing in for Expo's push API, like routing's own notifier test. */
describe('ExpoDriverNotifier', () => {
  let server: Server;
  let url: string;
  let received: { body: unknown; headers: IncomingMessage['headers'] }[];
  let reply: { status: number; body: unknown };

  beforeEach(async () => {
    received = [];
    reply = { status: 200, body: { data: [] } };
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        received.push({
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
          headers: request.headers,
        });
        response.writeHead(reply.status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(reply.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    url = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    server.close();
  });

  it('sends nothing, and says there are no devices, when the driver has none registered', async () => {
    const notifier = new ExpoDriverNotifier(
      { pushTokensFor: () => Promise.resolve([]) },
      undefined,
      url,
    );
    expect(await notifier.notify(driverId, message)).toEqual({ devices: 0, accepted: 0 });
    expect(received).toHaveLength(0);
  });

  it('sends one message per phone, with the access token, and counts the ones accepted', async () => {
    reply = { status: 200, body: { data: [{ status: 'ok' }, { status: 'error' }] } };
    const notifier = new ExpoDriverNotifier(
      { pushTokensFor: () => Promise.resolve(['ExponentPushToken[a]', 'ExponentPushToken[b]']) },
      'secret',
      url,
    );
    expect(await notifier.notify(driverId, message)).toEqual({ devices: 2, accepted: 1 });
    expect(received[0]?.headers.authorization).toBe('Bearer secret');
    expect(received[0]?.body).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[a]',
        title: 'New job assigned',
        data: message.data,
      }),
      expect.objectContaining({ to: 'ExponentPushToken[b]' }),
    ]);
  });

  it('throws when the push service answers with something unrecognised', async () => {
    reply = { status: 500, body: { oops: true } };
    const notifier = new ExpoDriverNotifier(
      { pushTokensFor: () => Promise.resolve(['ExponentPushToken[a]']) },
      undefined,
      url,
    );
    await expect(notifier.notify(driverId, message)).rejects.toThrow(/500/);
  });
});
