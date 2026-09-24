import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnthropicHazardParser } from './anthropic-hazard-parser.js';

interface ReceivedRequest {
  readonly body: { readonly [key: string]: unknown };
  readonly headers: IncomingMessage['headers'];
  respond(body: unknown, status: number): void;
}

function toolUseResponse(input: unknown): unknown {
  return {
    content: [{ type: 'tool_use', name: 'file_hazard_report', input }],
  };
}

/** A real local HTTP server standing in for Anthropic's Messages API — same philosophy as
 *  `expo-push-notifier.test.ts`/`valhalla-routing-engine.test.ts`: a genuine HTTP round trip
 *  against a fake we control, not a mocked `fetch`. No real ANTHROPIC_API_KEY exists to test
 *  against the live API with (docs/progress.md M7.1 deviations). */
describe('AnthropicHazardParser', () => {
  let server: Server;
  let baseUrl: string;
  let requests: Promise<ReceivedRequest>[];
  let nextIndex: number;

  beforeEach(async () => {
    requests = [];
    nextIndex = 0;
    let resolveNext: (received: ReceivedRequest) => void = () => undefined;
    requests.push(new Promise<ReceivedRequest>((resolve) => (resolveNext = resolve)));

    server = createServer((request: IncomingMessage, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const received: ReceivedRequest = {
          body: body as { readonly [key: string]: unknown },
          headers: request.headers,
          respond(responseBody: unknown, status: number): void {
            response.writeHead(status, { 'content-type': 'application/json' });
            response.end(JSON.stringify(responseBody));
          },
        };
        resolveNext(received);
        requests.push(new Promise<ReceivedRequest>((resolve) => (resolveNext = resolve)));
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

  async function nextRequest(): Promise<ReceivedRequest> {
    const pending = requests[nextIndex];
    if (pending === undefined) {
      throw new Error(`no request queued at index ${nextIndex}`);
    }
    nextIndex += 1;
    return pending;
  }

  it('sends the transcript and a forced tool call, with the API key header', async () => {
    const parser = new AnthropicHazardParser('secret-key', baseUrl);
    const parsePromise = parser.parse('low bridge just past the roundabout, about 3.5 metres');
    const received = await nextRequest();
    received.respond(
      toolUseResponse({
        type: 'low_bridge',
        measurement: { kind: 'height', value: 3.5, unit: 'm' },
      }),
      200,
    );
    await parsePromise;

    expect(received.headers['x-api-key']).toBe('secret-key');
    expect(received.body['messages']).toEqual([
      { role: 'user', content: 'low bridge just past the roundabout, about 3.5 metres' },
    ]);
    expect(received.body['tool_choice']).toEqual({ type: 'tool', name: 'file_hazard_report' });
  });

  it('returns the validated tool input on a well-formed first response', async () => {
    const parser = new AnthropicHazardParser('secret-key', baseUrl);
    const parsePromise = parser.parse('flooding on the a69');
    (await nextRequest()).respond(
      toolUseResponse({
        type: 'flooding',
        note: 'Flooding on the A69',
        positionHint: 'near Corbridge',
      }),
      200,
    );

    await expect(parsePromise).resolves.toEqual({
      type: 'flooding',
      note: 'Flooding on the A69',
      positionHint: 'near Corbridge',
    });
  });

  it('retries once when the first response has no tool_use block, then uses the retry', async () => {
    const parser = new AnthropicHazardParser('secret-key', baseUrl);
    const parsePromise = parser.parse('roadworks ahead');
    (await nextRequest()).respond({ content: [{ type: 'text', text: 'sorry, what?' }] }, 200);
    (await nextRequest()).respond(toolUseResponse({ type: 'roadworks' }), 200);

    await expect(parsePromise).resolves.toEqual({ type: 'roadworks' });
  });

  it('retries once when the tool input fails validation, then uses the retry', async () => {
    const parser = new AnthropicHazardParser('secret-key', baseUrl);
    const parsePromise = parser.parse('a really heavy something');
    (await nextRequest()).respond(
      toolUseResponse({
        type: 'weight_limit',
        measurement: { kind: 'weight', value: -1, unit: 't' },
      }),
      200,
    );
    (await nextRequest()).respond(toolUseResponse({ type: 'weight_limit' }), 200);

    await expect(parsePromise).resolves.toEqual({ type: 'weight_limit' });
  });

  it('falls back to type "other" with the raw transcript after two invalid responses', async () => {
    const parser = new AnthropicHazardParser('secret-key', baseUrl);
    const parsePromise = parser.parse('mumble mumble something on the road');
    (await nextRequest()).respond({ content: [{ type: 'text', text: 'huh?' }] }, 200);
    (await nextRequest()).respond({ content: [{ type: 'text', text: 'still unclear' }] }, 200);

    await expect(parsePromise).resolves.toEqual({
      type: 'other',
      note: 'mumble mumble something on the road',
    });
  });

  it('throws for a non-2xx response', async () => {
    const parser = new AnthropicHazardParser('secret-key', baseUrl);
    const parsePromise = parser.parse('low bridge ahead');
    (await nextRequest()).respond({ error: { message: 'invalid api key' } }, 401);

    await expect(parsePromise).rejects.toThrow(/401/);
  });

  it('throws for a malformed success body with no content array', async () => {
    const parser = new AnthropicHazardParser('secret-key', baseUrl);
    const parsePromise = parser.parse('low bridge ahead');
    (await nextRequest()).respond({ unexpected: 'shape' }, 200);

    await expect(parsePromise).rejects.toThrow(/unrecognised body/);
  });
});
