import { describe, expect, it } from 'vitest';
import { UuidIdGenerator } from './uuid-id-generator.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('UuidIdGenerator', () => {
  it('produces valid v4 UUIDs', () => {
    expect(new UuidIdGenerator().newId()).toMatch(UUID_V4);
  });

  it('does not repeat itself', () => {
    const ids = new UuidIdGenerator();
    const generated = new Set(Array.from({ length: 1000 }, () => ids.newId()));
    expect(generated.size).toBe(1000);
  });
});
