import type { InviteCodeGenerator } from '../ports/invite-code-generator.js';

/** Deterministic codes for tests: CODE1, CODE2, ... */
export class SequentialInviteCodeGenerator implements InviteCodeGenerator {
  #next = 1;

  next(): string {
    return `CODE${this.#next++}`;
  }
}
