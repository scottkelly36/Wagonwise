import { describe, expect, it } from 'vitest';
import { ScryptPasswordHasher } from './scrypt-password-hasher.js';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('correct horse battery staple');
    expect(await hasher.verify('correct horse battery staple', hash)).toBe(true);
    expect(await hasher.verify('correct horse battery stapler', hash)).toBe(false);
  });

  it('salts every hash, and never stores the password', async () => {
    const a = await hasher.hash('same password here');
    const b = await hasher.hash('same password here');
    expect(a).not.toBe(b);
    expect(a).not.toContain('same password here');
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[^$]+\$[^$]+$/);
  });

  it('treats differently-composed but identical-looking passwords the same (NFKC)', async () => {
    const hash = await hasher.hash('café lorry park');
    expect(await hasher.verify('café lorry park', hash)).toBe(true);
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    for (const bad of ['', 'plain', 'bcrypt$1$2$3$4$5', 'scrypt$x$8$1$c2FsdA==$aGFzaA==']) {
      expect(await hasher.verify('anything', bad)).toBe(false);
    }
  });
});
