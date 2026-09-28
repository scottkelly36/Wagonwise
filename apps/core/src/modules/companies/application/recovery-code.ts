/** Recovery codes are stored as the hash of `XXXXX-XXXXX` in capitals. People type them in any
 *  case, with or without the dash or spaces, so input is put into that form before hashing. */
export function normaliseRecoveryCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z0-9]{10}$/.test(compact)) return null;
  return `${compact.slice(0, 5)}-${compact.slice(5)}`;
}
