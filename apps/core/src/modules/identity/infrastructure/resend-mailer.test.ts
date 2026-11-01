import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ResendMailer } from './resend-mailer.js';

/** A real local HTTP server standing in for Resend's email API, as `resend-otp-sender.test.ts` does. */
describe('ResendMailer', () => {
  let server: Server;
  let baseUrl: string;
  let received: Promise<unknown>;

  beforeEach(async () => {
    received = new Promise<unknown>((resolveRequest) => {
      server = createServer((request: IncomingMessage, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          resolveRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ id: 'email-1' }));
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

  it('sends the HTML beside the text when there is HTML', async () => {
    const mailer = new ResendMailer('re_test_key', 'WagonWise <test@example.com>', baseUrl);
    await mailer.send({ to: 'a@example.com', subject: 'Hi', text: 'plain', html: '<p>fancy</p>' });
    expect(await received).toEqual({
      from: 'WagonWise <test@example.com>',
      to: 'a@example.com',
      subject: 'Hi',
      text: 'plain',
      html: '<p>fancy</p>',
    });
  });

  it('sends no html field for a plain-text email, as before', async () => {
    const mailer = new ResendMailer('re_test_key', 'WagonWise <test@example.com>', baseUrl);
    await mailer.send({ to: 'a@example.com', subject: 'Hi', text: 'plain' });
    expect(await received).toEqual({
      from: 'WagonWise <test@example.com>',
      to: 'a@example.com',
      subject: 'Hi',
      text: 'plain',
    });
  });
});
