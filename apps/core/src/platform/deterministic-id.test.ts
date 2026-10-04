import { describe, expect, it } from 'vitest';
import { deterministicUuid } from './deterministic-id.js';

describe('deterministicUuid', () => {
  it('gives the same id for the same parts', () => {
    expect(deterministicUuid('driver-1', 'vehicle-1')).toBe(
      deterministicUuid('driver-1', 'vehicle-1'),
    );
  });

  it('gives different ids for different parts, and the order matters', () => {
    const a = deterministicUuid('driver-1', 'vehicle-1');
    expect(deterministicUuid('driver-1', 'vehicle-2')).not.toBe(a);
    expect(deterministicUuid('driver-2', 'vehicle-1')).not.toBe(a);
    expect(deterministicUuid('vehicle-1', 'driver-1')).not.toBe(a);
  });

  it('does not let one part run into the next', () => {
    expect(deterministicUuid('ab', 'c')).not.toBe(deterministicUuid('a', 'bc'));
  });

  it('is shaped like a UUID (version 5, RFC 4122 variant)', () => {
    expect(deterministicUuid('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
