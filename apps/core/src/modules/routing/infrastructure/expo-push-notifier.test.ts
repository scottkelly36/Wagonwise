import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PushNotification } from '../application/ports/push-notifier.js';
import { ExpoPushNotifier } from './expo-push-notifier.js';

interface ReceivedRequest {
  readonly body: unknown;
  readonly headers: IncomingMessage['headers'];
  respond(body: unknown, status: number): void;
}

/** A real local HTTP server standing in for Expo's push API — same philosophy as
 *  `valhalla-routing-engine.test.ts`: a genuine HTTP round trip against a fake we control, not a
 *  mocked `fetch`. */
describe('ExpoPushNotifier', () => {
  let server: Server;
  let baseUrl: string;
  let nextRequest: Promise<ReceivedRequest>;

  beforeEach(async () => {
    nextRequest = new Promise<ReceivedRequest>((resolveRequest) => {
      server = createServer((request: IncomingMessage, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolveRequest({
            body,
            headers: request.headers,
            respond(responseBody: unknown, status: number): void {
              response.writeHead(status, { 'content-type': 'application/json' });
              response.end(JSON.stringify(responseBody));
            },
          });
        });
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const notification: PushNotification = {
    title: 'New hazard on your route',
    body: 'A low bridge was reported ahead on your route. Tap for a new route.',
    data: { newRoutePlanId: 'route-plan-1' },
  };

  it('sends one Expo-shaped message for the given token and notification', async () => {
    const notifier = new ExpoPushNotifier(undefined, baseUrl);
    const sendPromise = notifier.send('ExponentPushToken[abc]', notification);
    const received = await nextRequest;
    received.respond({ data: [{ status: 'ok', id: 'ticket-1' }] }, 200);
    await sendPromise;

    expect(received.body).toEqual([
      {
        to: 'ExponentPushToken[abc]',
        title: notification.title,
        body: notification.body,
        data: notification.data,
      },
    ]);
  });

  it('sends no Authorization header when no access token is configured', async () => {
    const notifier = new ExpoPushNotifier(undefined, baseUrl);
    const sendPromise = notifier.send('ExponentPushToken[abc]', notification);
    const received = await nextRequest;
    received.respond({ data: [{ status: 'ok', id: 'ticket-1' }] }, 200);
    await sendPromise;

    expect(received.headers.authorization).toBeUndefined();
  });

  it('sends the access token as a Bearer header when configured', async () => {
    const notifier = new ExpoPushNotifier('secret-token', baseUrl);
    const sendPromise = notifier.send('ExponentPushToken[abc]', notification);
    const received = await nextRequest;
    received.respond({ data: [{ status: 'ok', id: 'ticket-1' }] }, 200);
    await sendPromise;

    expect(received.headers.authorization).toBe('Bearer secret-token');
  });

  it('resolves without throwing on a successful ticket', async () => {
    const notifier = new ExpoPushNotifier(undefined, baseUrl);
    const sendPromise = notifier.send('ExponentPushToken[abc]', notification);
    (await nextRequest).respond({ data: [{ status: 'ok', id: 'ticket-1' }] }, 200);

    await expect(sendPromise).resolves.toBeUndefined();
  });

  it('logs and does not throw on an error ticket (e.g. a stale token)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const notifier = new ExpoPushNotifier(undefined, baseUrl);
    const sendPromise = notifier.send('ExponentPushToken[stale]', notification);
    (await nextRequest).respond(
      {
        data: [
          {
            status: 'error',
            message: 'The recipient device is not registered with FCM.',
            details: { error: 'DeviceNotRegistered' },
          },
        ],
      },
      200,
    );

    await expect(sendPromise).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('DeviceNotRegistered'));
    warn.mockRestore();
  });

  it('throws for a non-2xx response', async () => {
    const notifier = new ExpoPushNotifier(undefined, baseUrl);
    const sendPromise = notifier.send('ExponentPushToken[abc]', notification);
    (await nextRequest).respond({ errors: [{ message: 'bad request' }] }, 400);

    await expect(sendPromise).rejects.toThrow(/400/);
  });

  it('throws for a malformed success body with no data array', async () => {
    const notifier = new ExpoPushNotifier(undefined, baseUrl);
    const sendPromise = notifier.send('ExponentPushToken[abc]', notification);
    (await nextRequest).respond({ unexpected: 'shape' }, 200);

    await expect(sendPromise).rejects.toThrow(/unrecognised body/);
  });

  it('throws when the response has an empty data array', async () => {
    const notifier = new ExpoPushNotifier(undefined, baseUrl);
    const sendPromise = notifier.send('ExponentPushToken[abc]', notification);
    (await nextRequest).respond({ data: [] }, 200);

    await expect(sendPromise).rejects.toThrow(/no ticket/);
  });
});
