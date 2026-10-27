import { describe, expect, it } from 'vitest';
import {
  FuelFinderClient,
  NoFuelSource,
  pricesFromRecord,
  stationFromRecord,
} from './fuel-finder-client.js';

const BASE = 'https://fuel.example/api/v1';
const SECRET = 'very-secret-value';
const credentials = { clientId: 'the-client-id', clientSecret: SECRET, baseUrl: BASE };

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const tokenReply = (expiresIn = 3600): Response =>
  json(200, {
    success: true,
    data: { access_token: 'tok-1', token_type: 'Bearer', expires_in: expiresIn },
    message: 'Operation successful',
  });

const rawStation = (id: string, overrides: Record<string, unknown> = {}) => ({
  node_id: id,
  public_phone_number: '+448003234040',
  trading_name: `Station ${id}`,
  brand_name: 'TESCO',
  temporary_closure: false,
  permanent_closure: false,
  is_motorway_service_station: false,
  is_supermarket_service_station: true,
  location: {
    address_line_1: 'LOWER BRIDGE STREET',
    city: 'PONTYPOOL',
    postcode: 'NP4 6JU',
    latitude: 51.70007,
    longitude: -3.04025,
  },
  amenities: ['customer_toilets', 'water_filling'],
  ...overrides,
});

const rawPrices = (id: string, prices: unknown[]) => ({ node_id: id, fuel_prices: prices });
const diesel = (price: unknown = 198.9) => ({
  fuel_type: 'B7_STANDARD',
  price,
  price_last_updated: '2026-10-27T08:57:35.000Z',
  price_change_effective_timestamp: '2026-10-27T08:57:35.000Z',
});

interface Call {
  url: string;
  init: RequestInit;
}

/** A client wired to a scripted service. `serve` answers each non-token request; the clock only moves when the client waits. */
function setup(serve: (path: string, call: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const problems: { what: string; detail: unknown }[] = [];
  const slept: number[] = [];
  let tokenRequests = 0;
  let time = 1_000_000;
  let served = 0;
  const client = new FuelFinderClient(
    credentials,
    async (url, init) => {
      calls.push({ url, init });
      if (url === `${BASE}/oauth/generate_access_token`) {
        tokenRequests += 1;
        return tokenReply();
      }
      return serve(url.slice(BASE.length + 1), (served += 1));
    },
    (what, detail) => problems.push({ what, detail }),
    () => time,
    (ms) => {
      slept.push(ms);
      time += ms;
      return Promise.resolve();
    },
  );
  return {
    client,
    calls,
    problems,
    slept,
    tokenRequests: () => tokenRequests,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

/** Batches 1..n served as given, then 404, like the real service. */
const batches =
  (...pages: unknown[][]) =>
  (path: string): Response => {
    const n = Number(new URL(`http://x/${path}`).searchParams.get('batch-number'));
    const page = pages[n - 1];
    return page === undefined
      ? json(404, { success: false, message: 'Not found' })
      : json(200, page);
  };

describe('FuelFinderClient', () => {
  it('signs in with the id and secret in the form body, then sends the token as a bearer', async () => {
    const { client, calls } = setup(batches([rawStation('a')]));
    await client.fetchStations();
    const signIn = calls[0];
    expect(signIn?.url).toBe(`${BASE}/oauth/generate_access_token`);
    expect(signIn?.init.method).toBe('POST');
    const body = signIn?.init.body;
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(Object.fromEntries(body as URLSearchParams)).toEqual({
      grant_type: 'client_credentials',
      client_id: 'the-client-id',
      client_secret: SECRET,
      scope: 'fuelfinder.read',
    });
    const read = calls[1];
    expect((read?.init.headers as Record<string, string>)['authorization']).toBe('Bearer tok-1');
  });

  it('never puts the secret in a URL, a header or a reported problem', async () => {
    const { client, calls, problems } = setup(() => json(500, {}));
    await client.fetchStations();
    for (const call of calls) {
      expect(call.url).not.toContain(SECRET);
      expect(JSON.stringify(call.init.headers)).not.toContain(SECRET);
    }
    expect(JSON.stringify(problems)).not.toContain(SECRET);
  });

  it('reads stations batch by batch until the service runs out', async () => {
    const { client, calls } = setup(batches([rawStation('a'), rawStation('b')], [rawStation('c')]));
    const result = await client.fetchStations();
    expect(result.ok && result.value.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    const urls = calls.map((c) => c.url).filter((u) => u.includes('/pfs'));
    expect(urls).toEqual([
      `${BASE}/pfs?batch-number=1`,
      `${BASE}/pfs?batch-number=2`,
      `${BASE}/pfs?batch-number=3`,
    ]);
  });

  it('also stops at an empty batch', async () => {
    const { client } = setup(batches([rawStation('a')], []));
    const result = await client.fetchStations();
    expect(result.ok && result.value).toHaveLength(1);
  });

  it('reads prices from their own address', async () => {
    const { client, calls } = setup(batches([rawPrices('a', [diesel()])]));
    const result = await client.fetchPrices();
    expect(result.ok && result.value).toEqual([
      {
        stationId: 'a',
        fuelType: 'B7_STANDARD',
        pencePerLitre: 198.9,
        updatedAt: new Date('2026-10-27T08:57:35.000Z'),
      },
    ]);
    expect(calls[1]?.url).toBe(`${BASE}/pfs/fuel-prices?batch-number=1`);
  });

  it('signs in once and reuses the token, then signs in again after it has run out', async () => {
    const { client, tokenRequests, advance } = setup(batches([rawStation('a')]));
    await client.fetchStations();
    await client.fetchStations();
    expect(tokenRequests()).toBe(1);
    advance(3600 * 1000);
    await client.fetchStations();
    expect(tokenRequests()).toBe(2);
  });

  it('renews a token the service refuses, once, and carries on', async () => {
    const { client, tokenRequests } = setup((path, call) =>
      call === 1 ? json(401, {}) : batches([rawStation('a')])(path),
    );
    const result = await client.fetchStations();
    expect(result.ok && result.value).toHaveLength(1);
    expect(tokenRequests()).toBe(2);
  });

  it('gives up when a fresh token is refused too, rather than signing in over and over', async () => {
    const { client, tokenRequests, problems } = setup(() => json(401, {}));
    expect(await client.fetchStations()).toEqual({
      ok: false,
      error: { tag: 'FuelSourceUnavailable' },
    });
    expect(tokenRequests()).toBe(2);
    expect(problems.map((p) => p.what)).toContain('Fuel Finder refused the request');
  });

  it('waits as long as it is told after a "too many requests", then tries again', async () => {
    const { client, slept } = setup((path, call) =>
      call === 1 ? json(429, {}, { 'retry-after': '7' }) : batches([rawStation('a')])(path),
    );
    const result = await client.fetchStations();
    expect(result.ok && result.value).toHaveLength(1);
    expect(slept).toContain(7000);
  });

  it('stops asking after being told to slow down three times', async () => {
    const { client, calls } = setup(() => json(429, {}));
    expect(await client.fetchStations()).toEqual({
      ok: false,
      error: { tag: 'FuelSourceUnavailable' },
    });
    expect(calls.filter((c) => c.url.includes('/pfs'))).toHaveLength(4);
  });

  it('leaves at least 700 ms between requests', async () => {
    const { client, slept } = setup(batches([rawStation('a')], [rawStation('b')]));
    await client.fetchStations();
    // Three reads (two batches and the 404) follow one another with nothing else to wait for.
    expect(slept.filter((ms) => ms > 0 && ms <= 700).length).toBeGreaterThanOrEqual(2);
  });

  it('is unavailable, and says so, when the sign-in is refused', async () => {
    const problems: string[] = [];
    const client = new FuelFinderClient(
      credentials,
      () => Promise.resolve(json(401, { error: 'invalid_client' })),
      (what) => problems.push(what),
    );
    expect(await client.fetchPrices()).toEqual({
      ok: false,
      error: { tag: 'FuelSourceUnavailable' },
    });
    expect(problems).toEqual(['Fuel Finder refused the sign-in']);
  });

  it('is unavailable when the sign-in answers without a token', async () => {
    const client = new FuelFinderClient(credentials, () =>
      Promise.resolve(json(200, { success: true, data: {} })),
    );
    expect((await client.fetchStations()).ok).toBe(false);
  });

  it('is unavailable when there is no first batch, since an empty country is never right', async () => {
    const { client, problems } = setup(batches());
    expect((await client.fetchStations()).ok).toBe(false);
    expect(problems.map((p) => p.what)).toEqual(['Fuel Finder had no first batch']);
  });

  it('is unavailable when the answer is not a list', async () => {
    const { client } = setup(() => json(200, { success: true, data: [] }));
    expect((await client.fetchPrices()).ok).toBe(false);
  });

  it('returns nothing rather than half a list when a later batch fails', async () => {
    const { client } = setup((path, call) =>
      call === 1 ? json(200, [rawStation('a')]) : call === 2 ? json(503, {}) : batches()(path),
    );
    expect(await client.fetchStations()).toEqual({
      ok: false,
      error: { tag: 'FuelSourceUnavailable' },
    });
  });

  it('is unavailable when the service cannot be reached', async () => {
    const problems: string[] = [];
    const client = new FuelFinderClient(
      credentials,
      (url) =>
        url.endsWith('generate_access_token')
          ? Promise.resolve(tokenReply())
          : Promise.reject(new TypeError('fetch failed')),
      (what) => problems.push(what),
    );
    expect((await client.fetchStations()).ok).toBe(false);
    expect(problems).toEqual(['Fuel Finder could not be reached']);
  });
});

describe('stationFromRecord', () => {
  it('maps a station as the service describes it', () => {
    expect(stationFromRecord(rawStation('a'))).toEqual({
      id: 'a',
      name: 'Station a',
      brand: 'TESCO',
      addressLine: 'LOWER BRIDGE STREET',
      city: 'PONTYPOOL',
      postcode: 'NP4 6JU',
      phone: '+448003234040',
      position: { lat: 51.70007, lon: -3.04025 },
      isMotorway: false,
      isSupermarket: true,
      closed: false,
      amenities: ['customer_toilets', 'water_filling'],
    });
  });

  it('marks a station closed for a while or for good', () => {
    expect(stationFromRecord(rawStation('a', { temporary_closure: true }))?.closed).toBe(true);
    expect(stationFromRecord(rawStation('a', { permanent_closure: true }))?.closed).toBe(true);
  });

  it('leaves out a station with no id, no name or no usable position', () => {
    expect(stationFromRecord(rawStation('a', { node_id: '' }))).toBeUndefined();
    expect(stationFromRecord(rawStation('a', { trading_name: null }))).toBeUndefined();
    expect(stationFromRecord(rawStation('a', { location: null }))).toBeUndefined();
    const at = (latitude: unknown, longitude: unknown) =>
      stationFromRecord(rawStation('a', { location: { latitude, longitude } }));
    expect(at(0, 0)).toBeUndefined();
    expect(at(-3.04, 51.7)).toBeUndefined();
    expect(at(null, -3)).toBeUndefined();
    expect(at('51.7', '-3.04')?.position).toEqual({ lat: 51.7, lon: -3.04 });
  });

  it('copes with nonsense', () => {
    for (const junk of [null, undefined, 'x', 7, [], {}]) {
      expect(stationFromRecord(junk)).toBeUndefined();
    }
  });
});

describe('pricesFromRecord', () => {
  it('reads each fuel with its price in pence and when it was reported', () => {
    const prices = pricesFromRecord(
      rawPrices('a', [diesel(), { ...diesel(167.9), fuel_type: 'E10' }]),
    );
    expect(prices.map((p) => [p.fuelType, p.pencePerLitre])).toEqual([
      ['B7_STANDARD', 198.9],
      ['E10', 167.9],
    ]);
  });

  it('takes a lower-case grade and a price sent as text', () => {
    const [price] = pricesFromRecord(
      rawPrices('a', [{ ...diesel('198.9'), fuel_type: 'b7_standard' }]),
    );
    expect(price?.fuelType).toBe('B7_STANDARD');
    expect(price?.pencePerLitre).toBe(198.9);
  });

  it('drops a price for a grade it does not know, one typed in pounds, and one with no readable date, keeping the rest', () => {
    const prices = pricesFromRecord(
      rawPrices('a', [
        { ...diesel(), fuel_type: 'LPG' },
        diesel(1.989),
        { ...diesel(), price_last_updated: 'yesterday' },
        { ...diesel(), price_last_updated: undefined },
        diesel(197.9),
      ]),
    );
    expect(prices.map((p) => p.pencePerLitre)).toEqual([197.9]);
  });

  it('gives nothing for a station with no prices or a malformed entry', () => {
    expect(pricesFromRecord({ node_id: 'a', fuel_prices: [] })).toEqual([]);
    expect(pricesFromRecord({ node_id: 'a' })).toEqual([]);
    expect(pricesFromRecord({ fuel_prices: [diesel()] })).toEqual([]);
    expect(pricesFromRecord(rawPrices('a', [null, 'x', 4]))).toEqual([]);
  });
});

describe('NoFuelSource', () => {
  it('is off, and every fetch is unavailable without any request', async () => {
    const source = new NoFuelSource();
    expect(source.enabled).toBe(false);
    expect(await source.fetchStations()).toEqual({
      ok: false,
      error: { tag: 'FuelSourceUnavailable' },
    });
    expect(await source.fetchPrices()).toEqual({
      ok: false,
      error: { tag: 'FuelSourceUnavailable' },
    });
  });
});
