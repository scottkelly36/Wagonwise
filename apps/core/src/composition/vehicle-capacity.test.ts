import { describe, expect, it } from 'vitest';
import { NO_LIMIT, vehicleLimit } from './vehicle-capacity.js';

describe('vehicleLimit', () => {
  const plan = (n: number) => () => Promise.resolve(n);

  it('is the plan’s room until payment details are on file', async () => {
    expect(await vehicleLimit(plan(5), () => Promise.resolve(false))('c1')).toBe(5);
  });

  it('is no limit once they are, whatever the plan says', async () => {
    expect(await vehicleLimit(plan(5), () => Promise.resolve(true))('c1')).toBe(NO_LIMIT);
    expect(await vehicleLimit(plan(0), () => Promise.resolve(true))('c1')).toBe(NO_LIMIT);
  });

  it('asks about the company it was given, and only reads the plan when it needs it', async () => {
    const asked: string[] = [];
    let planReads = 0;
    const limit = vehicleLimit(
      (id) => {
        planReads += 1;
        return Promise.resolve(id === 'a' ? 3 : 7);
      },
      (id) => {
        asked.push(id);
        return Promise.resolve(id === 'b');
      },
    );
    expect(await limit('a')).toBe(3);
    expect(await limit('b')).toBe(NO_LIMIT);
    expect(asked).toEqual(['a', 'b']);
    expect(planReads).toBe(1);
  });
});
