import type { PasswordHasher } from '../ports/password-hasher.js';

/** A hash anyone can read, so a test can see what was stored. Never used outside tests. */
export class FakePasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return Promise.resolve(`hashed:${password}`);
  }

  verify(password: string, stored: string): Promise<boolean> {
    return Promise.resolve(stored === `hashed:${password}`);
  }
}
