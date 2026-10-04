import { createHash } from 'node:crypto';

/**
 * A UUID worked out from the parts given, so the same parts always give the same id (a version-5
 * style UUID, SHA-1 over a fixed namespace and the parts). Used when something must be found again
 * without a lookup table, e.g. the routing profile for a particular driver and company vehicle.
 */
export function deterministicUuid(...parts: readonly string[]): string {
  const hash = createHash('sha1').update('wagonwise:').update(parts.join('\u0000')).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50; // version 5
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
