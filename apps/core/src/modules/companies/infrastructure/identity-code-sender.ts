import type { CodeSender } from '../application/ports/code-sender.js';

/**
 * `CodeSender` over identity's facade (`IdentityModule.sendOneTimeCode`), passed in as a plain
 * function so this module never imports identity (AGENTS.md rules 6-7). The composition root
 * connects the two.
 */
export class IdentityCodeSender implements CodeSender {
  constructor(
    private readonly sendOneTimeCode: (destination: string, code: string) => Promise<void>,
  ) {}

  send(destination: string, code: string): Promise<void> {
    return this.sendOneTimeCode(destination, code);
  }
}
