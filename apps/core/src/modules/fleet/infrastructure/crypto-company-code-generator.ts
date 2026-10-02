import { randomInt } from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH } from '../domain/company-code.js';
import type { CodeGenerator } from '../application/ports/company-code-repository.js';

/** An 8-character code from Node's CSPRNG (`randomInt` avoids the modulo bias `Math.random()`
 *  has, same reasoning as identity's `CryptoInviteCodeGenerator`). No collision check against
 *  existing codes: `CODE_ALPHABET.length ** CODE_LENGTH` (31^8, ~850 billion) makes a real
 *  collision practically impossible at the volume this app will ever generate, the same trust
 *  every UUID generated elsewhere in this codebase already places in its own, much larger space.
 *  Migration 0028's `unique` constraint on `fleet.company_codes.code` would reject one anyway. */
export class CryptoCompanyCodeGenerator implements CodeGenerator {
  generate(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    }
    return code;
  }
}
