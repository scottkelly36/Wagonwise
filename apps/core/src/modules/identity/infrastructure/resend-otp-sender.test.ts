import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ResendOtpSender } from './resend-otp-sender.js';

interface ReceivedRequest {
  readonly body: unknown;
  readonly headers: IncomingMessage['headers'];
  respond(body: unknown, status: number): void;
}

/** A real local HTTP server standing in for Resend's email API — same philosophy as
 *  `clicksend-otp-sender.test.ts` and `expo-push-notifier.test.ts`. */
describe('ResendOtpSender', () => {
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

  it('sends one Resend-shaped email with the OTP code in the body', async () => {
    const sender = new ResendOtpSender('re_test_key', 'WagonWise <test@example.com>', baseUrl);
    const sendPromise = sender.send('driver@example.com', '123456');
    const received = await nextRequest;
    received.respond({ id: 'email-1' }, 200);
    await sendPromise;

    expect(received.body).toEqual({
      from: 'WagonWise <test@example.com>',
      to: 'driver@example.com',
      subject: 'Your WagonWise sign-in code',
      text: 'Your WagonWise sign-in code is 123456. It expires in 10 minutes.',
    });
  });

  it('authenticates with a Bearer token', async () => {
    const sender = new ResendOtpSender('re_test_key', 'WagonWise <test@example.com>', baseUrl);
    const sendPromise = sender.send('driver@example.com', '123456');
    const received = await nextRequest;
    received.respond({ id: 'email-1' }, 200);
    await sendPromise;

    expect(received.headers.authorization).toBe('Bearer re_test_key');
  });

  it('resolves without throwing on a successful response', async () => {
    const sender = new ResendOtpSender('re_test_key', 'WagonWise <test@example.com>', baseUrl);
    const sendPromise = sender.send('driver@example.com', '123456');
    (await nextRequest).respond({ id: 'email-1' }, 200);

    await expect(sendPromise).resolves.toBeUndefined();
  });

  it('throws for a non-2xx response', async () => {
    const sender = new ResendOtpSender('re_test_key', 'WagonWise <test@example.com>', baseUrl);
    const sendPromise = sender.send('driver@example.com', '123456');
    (await nextRequest).respond({ message: 'invalid from address' }, 422);

    await expect(sendPromise).rejects.toThrow(/422/);
  });

  it('throws for a malformed body with no id', async () => {
    const sender = new ResendOtpSender('re_test_key', 'WagonWise <test@example.com>', baseUrl);
    const sendPromise = sender.send('driver@example.com', '123456');
    (await nextRequest).respond({ unexpected: 'shape' }, 200);

    await expect(sendPromise).rejects.toThrow(/unrecognised body/);
  });

  it('rejects a phone identifier without making a request — email-only, no SMS adapter here', async () => {
    const sender = new ResendOtpSender('re_test_key', 'WagonWise <test@example.com>', baseUrl);

    await expect(sender.send('+447123456789', '123456')).rejects.toThrow(/only sends email/);
  });
});
