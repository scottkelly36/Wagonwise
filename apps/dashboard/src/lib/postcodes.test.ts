import { describe, expect, it, vi } from 'vitest';

import {
  lookupPostcode,
  normalisePostcode,
  parsePostcodeResponse,
  PostcodeNotFoundError,
} from './postcodes';

describe('normalisePostcode', () => {
  it.each([
    ['NE46 3LR', 'NE46 3LR'],
    ['ne463lr', 'NE46 3LR'],
    ['  ne46   3lr ', 'NE46 3LR'],
    ['M1 1AE', 'M1 1AE'],
    ['m11ae', 'M1 1AE'],
    ['EC1A 1BB', 'EC1A 1BB'],
    ['W1A 0AX', 'W1A 0AX'],
    ['B33 8TH', 'B33 8TH'],
  ])('accepts and tidies %s', (input, expected) => {
    expect(normalisePostcode(input)).toBe(expected);
  });

  it.each(['', 'NE46', 'NE46 3L', '12345', 'NE46 3LRX', 'hello world', 'NE46-3LR'])(
    'says %j is not shaped like a postcode yet',
    (input) => {
      expect(normalisePostcode(input)).toBeUndefined();
    },
  );
});

describe('parsePostcodeResponse', () => {
  const hexham = {
    status: 200,
    result: {
      postcode: 'NE46 3LR',
      latitude: 54.9707,
      longitude: -2.1013,
      parish: 'Hexham',
      admin_district: 'Northumberland',
      admin_county: null,
      region: 'North East',
    },
  };

  it('maps the point and a short place name', () => {
    expect(parsePostcodeResponse(hexham)).toEqual({
      postcode: 'NE46 3LR',
      place: 'Hexham, Northumberland',
      location: { lat: 54.9707, lon: -2.1013 },
    });
  });

  it('does not repeat a name that is the same at two levels', () => {
    const body = {
      result: {
        ...hexham.result,
        parish: 'Newcastle upon Tyne',
        admin_district: 'Newcastle upon Tyne',
      },
    };
    expect(parsePostcodeResponse(body)?.place).toBe('Newcastle upon Tyne');
  });

  it('drops the "unparished area" placeholder postcodes.io uses for towns with no parish', () => {
    const body = {
      result: {
        ...hexham.result,
        parish: 'Newcastle upon Tyne, unparished area',
        admin_district: 'Newcastle upon Tyne',
      },
    };
    expect(parsePostcodeResponse(body)?.place).toBe('Newcastle upon Tyne');
  });

  it('falls back to the region when no local names are given', () => {
    const body = {
      result: { ...hexham.result, parish: null, admin_district: null, admin_county: null },
    };
    expect(parsePostcodeResponse(body)?.place).toBe('North East');
  });

  it('refuses a postcode with no coordinates', () => {
    expect(
      parsePostcodeResponse({ result: { ...hexham.result, latitude: null, longitude: null } }),
    ).toBeUndefined();
  });

  it.each([null, undefined, {}, { result: null }, 'nonsense'])('refuses %j', (body) => {
    expect(parsePostcodeResponse(body)).toBeUndefined();
  });
});

describe('lookupPostcode', () => {
  function respond(status: number, body: unknown): typeof fetch {
    return vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    });
  }

  it('asks postcodes.io for the (encoded) postcode', async () => {
    const fetchFn = respond(200, {
      result: { postcode: 'NE46 3LR', latitude: 54.97, longitude: -2.1, parish: 'Hexham' },
    });
    const result = await lookupPostcode('NE46 3LR', fetchFn);
    expect(result.location).toEqual({ lat: 54.97, lon: -2.1 });
    expect(fetchFn).toHaveBeenCalledWith('https://api.postcodes.io/postcodes/NE46%203LR');
  });

  it('throws PostcodeNotFoundError for a postcode that does not exist', async () => {
    await expect(
      lookupPostcode('ZZ99 9ZZ', respond(404, { status: 404, error: 'Invalid postcode' })),
    ).rejects.toBeInstanceOf(PostcodeNotFoundError);
  });

  it('throws PostcodeNotFoundError for one with no usable point', async () => {
    await expect(
      lookupPostcode(
        'NE46 3LR',
        respond(200, { result: { postcode: 'NE46 3LR', latitude: null, longitude: null } }),
      ),
    ).rejects.toBeInstanceOf(PostcodeNotFoundError);
  });

  it('throws a plain error when postcodes.io is down, so it is not mistaken for a typo', async () => {
    const error = await lookupPostcode('NE46 3LR', respond(503, {})).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(PostcodeNotFoundError);
  });
});
