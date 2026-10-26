import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClickSendTextSender } from './clicksend-text-sender.js';

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ClickSendTextSender', () => {
  it('posts the text with the account in a header and not in the body', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(reply(200, { response_code: 'SUCCESS' }));
    await new ClickSendTextSender('user', 'secret').send('+447700900123', 'Hello');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://rest.clicksend.com/v3/sms/send');
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [{ to: '+447700900123', body: 'Hello', source: 'wagonwise' }],
    });
    expect(init.body as string).not.toContain('secret');
    expect((init.headers as Record<string, string>)['authorization']).toMatch(/^Basic /);
  });

  it('refuses something that is not a phone number without calling ClickSend', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(new ClickSendTextSender('u', 'k').send('pat@example.com', 'Hi')).rejects.toThrow(
      /not a phone number/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when ClickSend refuses or answers nonsense', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(401, { response_code: 'BAD' }));
    await expect(new ClickSendTextSender('u', 'k').send('+447700900123', 'Hi')).rejects.toThrow(
      /401/,
    );
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      reply(200, { response_code: 'INSUFFICIENT_CREDIT', response_msg: 'no credit' }),
    );
    await expect(new ClickSendTextSender('u', 'k').send('+447700900123', 'Hi')).rejects.toThrow(
      /no credit/,
    );
  });
});
