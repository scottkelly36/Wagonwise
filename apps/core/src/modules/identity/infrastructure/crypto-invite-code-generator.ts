import { randomInt } from 'node:crypto';
import type { InviteCodeGenerator } from '../application/ports/invite-code-generator.js';

// Excludes 0/O and 1/I — a code this short is meant to be read aloud or typed on a phone
// keyboard by a tester on-site (design doc §9), same reasoning phone-support codes everywhere
// drop visually ambiguous characters.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** An 8-character code from Node's CSPRNG (`randomInt` avoids the modulo bias `Math.random()`
 *  has, same reasoning as `CryptoOtpCodeGenerator`). No collision check against existing codes:
 *  `ALPHABET.length ** CODE_LENGTH` (33^8, ~1.4 trillion) makes a real collision practically
 *  impossible at the volume this app will ever generate — the same trust every UUID generated
 *  elsewhere in this codebase already places in its own, much larger space. */
export class CryptoInviteCodeGenerator implements InviteCodeGenerator {
  next(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += ALPHABET[randomInt(0, ALPHABET.length)];
    }
    return code;
  }
}
