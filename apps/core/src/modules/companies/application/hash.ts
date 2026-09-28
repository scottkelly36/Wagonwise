import { createHash } from 'node:crypto';

/** sha256 hex of invite tokens, refresh tokens, and texted/emailed codes before they're stored.
 *  Duplicated from identity's own `hash.ts` rather than shared (AGENTS.md rule 6). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
