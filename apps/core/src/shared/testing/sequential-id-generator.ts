import type { IdGenerator } from '../ports/id-generator.js';

/**
 * Deterministic, UUID-shaped IDs: 00000000-0000-4000-8000-000000000001, ...002, and so on.
 * UUID-shaped so anything downstream that validates the format still accepts them.
 */
export class SequentialIdGenerator implements IdGenerator {
  #next = 1;

  newId(): string {
    const suffix = String(this.#next++).padStart(12, '0');
    return `00000000-0000-4000-8000-${suffix}`;
  }
}
