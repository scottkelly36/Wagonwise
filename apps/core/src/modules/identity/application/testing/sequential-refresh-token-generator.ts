import type { RefreshTokenGenerator } from '../ports/refresh-token-generator.js';

/** Deterministic tokens for tests: refresh-token-1, refresh-token-2, ... */
export class SequentialRefreshTokenGenerator implements RefreshTokenGenerator {
  #next = 1;

  next(): string {
    return `refresh-token-${this.#next++}`;
  }
}
