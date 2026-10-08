import { describe, expect, it } from 'vitest';
import {
  kindOf,
  MetOfficeWarningsClient,
  relatedLinkOf,
  warningFromFeature,
  warningsFromCollection,
} from './met-office-client.js';

const feature = {
  type: 'Feature',
  properties: {
    warningId: 'abc',
    warningLevel: 'AMBER',
    weatherType: ['WIND', 'RAIN'],
    warningHeadline: 'Amber warning of wind',
    warningFurtherDetails: 'Gusts to 70 mph.',
    validFromDate: '2026-10-10T06:00:00Z',
    validToDate: '2026-10-10T18:00:00Z',
    affectedAreas: ['North East England'],
    warningStatus: 'NEW',
  },
  geometry: {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    ],
  },
};

describe('kindOf', () => {
  it('matches the Met Office names loosely', () => {
    expect(kindOf('WIND')).toBe('wind');
    expect(kindOf('Thunderstorm')).toBe('thunderstorm');
    expect(kindOf('EXTREME HEAT')).toBe('heat');
    expect(kindOf('Snow')).toBe('snow');
    expect(kindOf('Ice')).toBe('ice');
    expect(kindOf('Fog')).toBe('fog');
    expect(kindOf('Rain')).toBe('rain');
    expect(kindOf('Tornado')).toBe('other');
  });
});

describe('warningFromFeature', () => {
  it('reads a warning', () => {
    const warning = warningFromFeature(feature);
    expect(warning).toMatchObject({
      id: 'abc',
      level: 'amber',
      kinds: ['wind', 'rain'],
      headline: 'Amber warning of wind',
      details: 'Gusts to 70 mph.',
      areas: ['North East England'],
    });
    expect(warning?.validFrom.toISOString()).toBe('2026-10-10T06:00:00.000Z');
  });

  it('lifts a Polygon into a MultiPolygon', () => {
    const polygon = {
      ...feature,
      geometry: { type: 'Polygon', coordinates: feature.geometry.coordinates[0] },
    };
    expect(warningFromFeature(polygon)?.area).toHaveLength(1);
  });

  it('skips a cancelled warning and one missing what it needs', () => {
    const cancelled = {
      ...feature,
      properties: { ...feature.properties, warningStatus: 'CANCELLED' },
    };
    expect(warningFromFeature(cancelled)).toBeUndefined();
    const noLevel = { ...feature, properties: { ...feature.properties, warningLevel: 'PURPLE' } };
    expect(warningFromFeature(noLevel)).toBeUndefined();
    expect(warningFromFeature(null)).toBeUndefined();
    expect(warningFromFeature({ properties: {} })).toBeUndefined();
  });
});

describe('warningsFromCollection', () => {
  it('keeps the good ones and tolerates junk', () => {
    expect(warningsFromCollection({ features: [feature, 7, {}] })).toHaveLength(1);
    expect(warningsFromCollection({ features: [] })).toEqual([]);
    expect(warningsFromCollection(null)).toEqual([]);
  });
});

describe('relatedLinkOf', () => {
  it('finds the related link', () => {
    const atom =
      '<feed><link rel="self" href="https://x/feed/"/><link rel="related" type="application/vnd.geo+json" href="https://x/issued/1/" title="t"/></feed>';
    expect(relatedLinkOf(atom)).toBe('https://x/issued/1/');
    expect(relatedLinkOf('<feed></feed>')).toBeUndefined();
  });
});

describe('MetOfficeWarningsClient', () => {
  it('follows the feed to the warnings, sending the key', async () => {
    const calls: { url: string; key: string | undefined }[] = [];
    const fetchImpl = ((url: string, init: RequestInit) => {
      calls.push({ url, key: (init.headers as Record<string, string>)['apikey'] });
      const body = url.endsWith('/feed')
        ? '<feed><link rel="related" href="https://x/issued/1/"/></feed>'
        : JSON.stringify({ features: [feature] });
      return Promise.resolve(new Response(body));
    }) as unknown as typeof fetch;

    const warnings = await new MetOfficeWarningsClient('secret', fetchImpl).fetchWarnings();
    expect(warnings).toHaveLength(1);
    expect(calls.map((c) => c.key)).toEqual(['secret', 'secret']);
    expect(calls[1]?.url).toBe('https://x/issued/1/');
  });

  it('fails when the Met Office does', async () => {
    const fetchImpl = (() => Promise.resolve(new Response('no', { status: 500 }))) as typeof fetch;
    await expect(new MetOfficeWarningsClient('k', fetchImpl).fetchWarnings()).rejects.toThrow(
      '500',
    );
  });
});
