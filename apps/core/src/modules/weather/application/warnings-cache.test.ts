import { describe, expect, it } from 'vitest';
import type { WeatherWarning } from '../domain/warning.js';
import { WarningsCache, type WarningSource } from './warnings-cache.js';

const NOW = new Date('2026-10-10T12:00:00Z');
const clock = { now: () => NOW };

function warning(id: string, over: Partial<WeatherWarning> = {}): WeatherWarning {
  return {
    id,
    level: 'amber',
    kinds: ['wind'],
    headline: id,
    details: undefined,
    validFrom: new Date('2026-10-10T06:00:00Z'),
    validTo: new Date('2026-10-10T18:00:00Z'),
    areas: ['North East England'],
    area: [
      [
        [
          [-3, 54],
          [-1, 54],
          [-1, 56],
          [-3, 56],
          [-3, 54],
        ],
      ],
    ],
    ...over,
  };
}

describe('WarningsCache', () => {
  it('has nothing, and is not enabled, without a source', async () => {
    const cache = new WarningsCache(undefined, clock);
    await cache.refresh();
    expect(cache.enabled).toBe(false);
    expect(cache.current().warnings).toEqual([]);
    expect(cache.current().updatedAt).toBeUndefined();
  });

  it('serves what was fetched, leaving out warnings that have ended or are far off', async () => {
    const source: WarningSource = {
      fetchWarnings: () =>
        Promise.resolve([
          warning('now'),
          warning('ended', { validTo: new Date('2026-10-10T08:00:00Z') }),
          warning('later', {
            validFrom: new Date('2026-10-14T00:00:00Z'),
            validTo: new Date('2026-10-15T00:00:00Z'),
          }),
        ]),
    };
    const cache = new WarningsCache(source, clock);
    await cache.refresh();
    expect(cache.current().warnings.map((w) => w.id)).toEqual(['now']);
    expect(cache.current().updatedAt).toEqual(NOW);
  });

  it('answers for a point inside an area and not outside it', async () => {
    const cache = new WarningsCache(
      { fetchWarnings: () => Promise.resolve([warning('w')]) },
      clock,
    );
    await cache.refresh();
    expect(cache.at({ lat: 55, lon: -2 })).toHaveLength(1);
    expect(cache.at({ lat: 51, lon: 0 })).toHaveLength(0);
  });

  it('keeps the last good set when a fetch fails', async () => {
    let fail = false;
    const cache = new WarningsCache(
      {
        fetchWarnings: () =>
          fail ? Promise.reject(new Error('down')) : Promise.resolve([warning('w')]),
      },
      clock,
    );
    await cache.refresh();
    fail = true;
    await expect(cache.refresh()).rejects.toThrow('down');
    expect(cache.current().warnings).toHaveLength(1);
  });
});
