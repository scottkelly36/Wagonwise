import { parseGeocodingResponse, searchAddress } from './geocoding';

describe('parseGeocodingResponse', () => {
  it('maps place_name and center into placeName/point', () => {
    const body = {
      features: [
        { place_name: 'Hexham, Northumberland, United Kingdom', center: [-2.1017, 54.9714] },
      ],
    };
    expect(parseGeocodingResponse(body)).toEqual([
      {
        placeName: 'Hexham, Northumberland, United Kingdom',
        point: { lon: -2.1017, lat: 54.9714 },
      },
    ]);
  });

  it('returns an empty array when there are no features', () => {
    expect(parseGeocodingResponse({ features: [] })).toEqual([]);
  });

  it('returns an empty array for a malformed response with no features array', () => {
    expect(parseGeocodingResponse({})).toEqual([]);
    expect(parseGeocodingResponse(null)).toEqual([]);
  });

  it('drops a feature missing a place name, keeping the well-formed ones', () => {
    const body = {
      features: [
        { center: [-2.1017, 54.9714] },
        { place_name: 'Hexham', center: [-2.1017, 54.9714] },
      ],
    };
    expect(parseGeocodingResponse(body)).toEqual([
      { placeName: 'Hexham', point: { lon: -2.1017, lat: 54.9714 } },
    ]);
  });

  it('drops a feature with a malformed centre', () => {
    const body = {
      features: [
        { place_name: 'Nowhere', center: [-2.1017] },
        { place_name: 'Somewhere', center: ['not', 'numbers'] },
      ],
    };
    expect(parseGeocodingResponse(body)).toEqual([]);
  });
});

describe('searchAddress', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('requests the query with the api key, country and proximity bias, parsing the response', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [{ place_name: 'Hexham', center: [-2.1017, 54.9714] }],
        }),
    });
    globalThis.fetch = fetchMock;

    const result = await searchAddress('Hexham', 'key-1', { lat: 54.97, lon: -2.1 });

    expect(result).toEqual([{ placeName: 'Hexham', point: { lon: -2.1017, lat: 54.9714 } }]);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/geocoding/Hexham.json');
    expect(url).toContain('key=key-1');
    expect(url).toContain('country=gb');
    expect(url).toContain('proximity=-2.1%2C54.97');
  });

  it('omits proximity when no current location is known', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    globalThis.fetch = fetchMock;

    await searchAddress('Hexham', 'key-1', undefined);

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).not.toContain('proximity');
  });

  it('throws on a non-2xx response', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect(searchAddress('Hexham', 'key-1', undefined)).rejects.toThrow(/500/);
  });
});
