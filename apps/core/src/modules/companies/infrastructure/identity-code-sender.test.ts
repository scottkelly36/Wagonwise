import { describe, expect, it } from 'vitest';
import { IdentityCodeSender } from './identity-code-sender.js';

describe('IdentityCodeSender', () => {
  it("passes destination and code straight to identity's sendOneTimeCode", async () => {
    const sent: [string, string][] = [];
    const sender = new IdentityCodeSender((destination, code) => {
      sent.push([destination, code]);
      return Promise.resolve();
    });
    await sender.send('+447700900123', '123456');
    await sender.send('office@acme.example', '654321');
    expect(sent).toEqual([
      ['+447700900123', '123456'],
      ['office@acme.example', '654321'],
    ]);
  });

  it('surfaces a delivery failure rather than swallowing it', async () => {
    const sender = new IdentityCodeSender(() => Promise.reject(new Error('ClickSend down')));
    await expect(sender.send('+447700900123', '123456')).rejects.toThrow('ClickSend down');
  });
});
