import { describe, expect, it } from 'vitest';
import { SequentialIdGenerator } from './sequential-id-generator.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('SequentialIdGenerator', () => {
  it('is deterministic and counts up', () => {
    const ids = new SequentialIdGenerator();
    expect(ids.newId()).toBe('00000000-0000-4000-8000-000000000001');
    expect(ids.newId()).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('produces UUID-shaped values so format validation downstream still passes', () => {
    const ids = new SequentialIdGenerator();
    expect(ids.newId()).toMatch(UUID_V4);
  });

  it('gives every instance its own sequence', () => {
    expect(new SequentialIdGenerator().newId()).toBe(new SequentialIdGenerator().newId());
  });
});
