import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClickSendOtpSender } from './clicksend-otp-sender.js';

interface ReceivedRequest {
  readonly body: unknown;
  readonly headers: IncomingMessage['headers'];
  respond(body: unknown, status: number): void;
}

/** A real local HTTP server standing in for ClickSend's SMS API — same philosophy as
 *  `expo-push-notifier.test.ts`: a genuine HTTP round trip against a fake we control. */
describe('ClickSendOtpSender', () => {
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

  it('sends one ClickSend-shaped SMS with the OTP code in the body', async () => {
    const sender = new ClickSendOtpSender('driver@example.com', 'api-key', baseUrl);
    const sendPromise = sender.send('+447123456789', '123456');
    const received = await nextRequest;
    received.respond(
      { response_code: 'SUCCESS', response_msg: 'Messages queued for delivery.' },
      200,
    );
    await sendPromise;

    expect(received.body).toEqual({
      messages: [
        {
          to: '+447123456789',
          body: 'Your WagonWise sign-in code is 123456. It expires in 10 minutes.',
          source: 'wagonwise',
        },
      ],
    });
  });

  it('authenticates with HTTP Basic auth using the username and API key', async () => {
    const sender = new ClickSendOtpSender('driver@example.com', 'api-key', baseUrl);
    const sendPromise = sender.send('+447123456789', '123456');
    const received = await nextRequest;
    received.respond({ response_code: 'SUCCESS', response_msg: 'ok' }, 200);
    await sendPromise;

    const expected = `Basic ${Buffer.from('driver@example.com:api-key').toString('base64')}`;
    expect(received.headers.authorization).toBe(expected);
  });

  it('resolves without throwing on a SUCCESS response', async () => {
    const sender = new ClickSendOtpSender('driver@example.com', 'api-key', baseUrl);
    const sendPromise = sender.send('+447123456789', '123456');
    (await nextRequest).respond({ response_code: 'SUCCESS', response_msg: 'ok' }, 200);

    await expect(sendPromise).resolves.toBeUndefined();
  });

  it('throws for a non-2xx response', async () => {
    const sender = new ClickSendOtpSender('driver@example.com', 'api-key', baseUrl);
    const sendPromise = sender.send('+447123456789', '123456');
    (await nextRequest).respond({ response_code: 'FAILED', response_msg: 'bad request' }, 400);

    await expect(sendPromise).rejects.toThrow(/400/);
  });

  it('throws when response_code is not SUCCESS even on a 200', async () => {
    const sender = new ClickSendOtpSender('driver@example.com', 'api-key', baseUrl);
    const sendPromise = sender.send('+447123456789', '123456');
    (await nextRequest).respond(
      { response_code: 'FAILED', response_msg: 'Insufficient balance' },
      200,
    );

    await expect(sendPromise).rejects.toThrow(/Insufficient balance/);
  });

  it('throws for a malformed body with no response_code', async () => {
    const sender = new ClickSendOtpSender('driver@example.com', 'api-key', baseUrl);
    const sendPromise = sender.send('+447123456789', '123456');
    (await nextRequest).respond({ unexpected: 'shape' }, 200);

    await expect(sendPromise).rejects.toThrow(/unrecognised body/);
  });

  it('rejects an email identifier without making a request — SMS-only, no email adapter exists', async () => {
    const sender = new ClickSendOtpSender('driver@example.com', 'api-key', baseUrl);

    await expect(sender.send('driver@example.com', '123456')).rejects.toThrow(/only sends SMS/);
  });
});
