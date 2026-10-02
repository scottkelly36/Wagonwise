/**
 * A company's join code: one reusable code per company, which a driver enters in the app to ask to
 * join (a request the company then approves; the code never admits anyone on its own). Typed by
 * hand from a message or a phone call, so the alphabet leaves out look-alikes (no 0/O, 1/I/L).
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 8;

/** What a person types, reduced to the stored form: upper case, no spaces or hyphens. */
export function normalizeCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

/** Right length and only from the alphabet. A malformed code is turned away without a lookup. */
export function isWellFormedCode(normalized: string): boolean {
  if (normalized.length !== CODE_LENGTH) return false;
  return [...normalized].every((c) => CODE_ALPHABET.includes(c));
}

/** `ABCD-2345`, for showing and reading out. */
export function formatCode(normalized: string): string {
  return `${normalized.slice(0, 4)}-${normalized.slice(4)}`;
}
