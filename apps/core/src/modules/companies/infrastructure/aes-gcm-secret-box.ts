import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretBox } from '../application/ports/secret-box.js';

const IV_LENGTH = 12;

/**
 * AES-256-GCM with a random IV per message: stored as `v1:iv:tag:ciphertext` (base64). GCM's tag
 * means a tampered or wrong-key ciphertext fails loudly rather than decrypting to garbage. The
 * `v1` prefix leaves room to rotate the key or the scheme later.
 */
export class AesGcmSecretBox implements SecretBox {
  readonly #key: Buffer;

  /** `key` is exactly 32 bytes (e.g. `Buffer.from(base64Env, 'base64')`). */
  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error('AesGcmSecretBox needs a 32-byte key');
    this.#key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.#key, iv);
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${body.toString('base64')}`;
  }

  decrypt(ciphertext: string): string {
    const [version, iv, tag, body] = ciphertext.split(':');
    if (version !== 'v1' || iv === undefined || tag === undefined || body === undefined) {
      throw new Error('not a v1 secret-box ciphertext');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.#key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString(
      'utf8',
    );
  }
}
