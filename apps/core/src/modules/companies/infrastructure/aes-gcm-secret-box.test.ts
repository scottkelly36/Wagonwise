import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AesGcmSecretBox } from './aes-gcm-secret-box.js';

describe('AesGcmSecretBox', () => {
  const box = new AesGcmSecretBox(randomBytes(32));

  it('round-trips, with a different ciphertext each time', () => {
    const a = box.encrypt('JBSWY3DPEHPK3PXP');
    const b = box.encrypt('JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.decrypt(a)).toBe('JBSWY3DPEHPK3PXP');
    expect(box.decrypt(b)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('fails loudly on a tampered ciphertext or the wrong key', () => {
    const ciphertext = box.encrypt('secret');
    const [v, iv, tag, body] = ciphertext.split(':');
    const flipped = Buffer.from(body ?? '', 'base64');
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => box.decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
    expect(() => new AesGcmSecretBox(randomBytes(32)).decrypt(ciphertext)).toThrow();
    expect(() => box.decrypt('not-a-ciphertext')).toThrow();
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => new AesGcmSecretBox(randomBytes(16))).toThrow();
  });
});
