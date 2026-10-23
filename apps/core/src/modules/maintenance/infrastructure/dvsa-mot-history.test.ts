import { describe, expect, it } from 'vitest';
import { DvsaMotHistory, motDatesFromHistory } from './dvsa-mot-history.js';

const credentials = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  apiKey: 'api-key',
  tokenUrl: 'https://login.example/tenant/oauth2/v2.0/token',
  scope: 'https://tapi.dvsa.gov.uk/.default',
};

const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const passed = (completedDate: string, expiryDate: string | null) => ({
  completedDate,
  testResult: 'PASSED',
  expiryDate,
});

describe('motDatesFromHistory', () => {
  const today = '2026-10-23';

  it('takes the expiry of the latest passed test', () => {
    const dates = motDatesFromHistory(
      {
        registration: 'AB12CDE',
        motTests: [
          passed('2025-07-01T08:30:31.000Z', '2026-07-11'),
          passed('2026-07-07T06:57:28.000Z', '2027-07-11'),
          passed('2024-07-06T09:43:22.000Z', '2025-07-11'),
        ],
      },
      today,
    );
    expect(dates).toEqual({
      motExpiry: '2027-07-11',
      motStatus: 'Valid',
      taxDue: undefined,
      taxStatus: undefined,
    });
  });

  it('says expired when the last pass has run out', () => {
    const dates = motDatesFromHistory(
      { motTests: [passed('2025-07-01T08:30:31.000Z', '2026-07-11')] },
      today,
    );
    expect(dates).toMatchObject({ motExpiry: '2026-07-11', motStatus: 'Expired' });
  });

  it('does not let a later failed test cancel an earlier pass that still counts', () => {
    const dates = motDatesFromHistory(
      {
        motTests: [
          passed('2026-06-01T09:00:00.000Z', '2027-06-10'),
          { completedDate: '2026-09-01T09:00:00.000Z', testResult: 'FAILED', expiryDate: null },
        ],
      },
      today,
    );
    expect(dates).toMatchObject({ motExpiry: '2027-06-10', motStatus: 'Valid' });
  });

  it('has no date for a vehicle with no passed test, unless DVSA says when its first is due', () => {
    expect(motDatesFromHistory({ motTests: [] }, today)).toMatchObject({
      motExpiry: undefined,
      motStatus: 'No test on record',
    });
    expect(
      motDatesFromHistory({ motTests: [], motTestDueDate: '2027-01-15' }, today),
    ).toMatchObject({
      motExpiry: '2027-01-15',
      motStatus: 'No test yet',
    });
  });

  it('leaves out what is not a real day and copes with odd bodies', () => {
    expect(
      motDatesFromHistory({ motTests: [passed('2026-07-01T00:00:00.000Z', '2026-02-30')] }, today),
    ).toMatchObject({ motExpiry: undefined });
    expect(motDatesFromHistory(null, today)).toMatchObject({ motExpiry: undefined });
    expect(
      motDatesFromHistory(
        [{ motTests: [passed('2026-07-01T00:00:00.000Z', '2027-07-01')] }],
        today,
      ),
    ).toMatchObject({ motExpiry: '2027-07-01' });
  });
});

describe('DvsaMotHistory', () => {
  function build(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
    const calls: { url: string; init: RequestInit }[] = [];
    let nowMs = new Date('2026-10-23T09:00:00Z').getTime();
    const lookup = new DvsaMotHistory(
      credentials,
      (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(handler(url, init));
      },
      () => new Date(nowMs),
    );
    return { lookup, calls, advance: (ms: number) => (nowMs += ms) };
  }

  const isToken = (url: string) => url.includes('/oauth2/');
  const history = { motTests: [passed('2026-07-07T06:57:28.000Z', '2027-07-11')] };
  const ok = (url: string) =>
    isToken(url) ? reply(200, { access_token: 'tok', expires_in: 3599 }) : reply(200, history);

  it('signs in, looks the registration up with the token and the key, and reads the dates', async () => {
    const { lookup, calls } = build(ok);
    const result = await lookup.lookup('ab12 cde');
    expect(result).toMatchObject({
      ok: true,
      value: { motExpiry: '2027-07-11', motStatus: 'Valid' },
    });

    const [token, vehicle] = calls;
    expect(token!.init.method).toBe('POST');
    const form = new URLSearchParams(token!.init.body as URLSearchParams);
    expect(form.get('grant_type')).toBe('client_credentials');
    expect(form.get('client_id')).toBe('client-id');
    expect(form.get('scope')).toBe('https://tapi.dvsa.gov.uk/.default');
    expect(vehicle!.url).toBe(
      'https://history.mot.api.gov.uk/v1/trade/vehicles/registration/AB12CDE',
    );
    const headers = vehicle!.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer tok');
    expect(headers['x-api-key']).toBe('api-key');
  });

  it('keeps the token between lookups and signs in again once it is nearly out', async () => {
    const { lookup, calls, advance } = build(ok);
    await lookup.lookup('AB12CDE');
    await lookup.lookup('AB12CDE');
    expect(calls.filter((c) => isToken(c.url))).toHaveLength(1);
    advance(3_300_000); // 55 minutes: inside the 5-minute margin of a 3,599 second token
    await lookup.lookup('AB12CDE');
    expect(calls.filter((c) => isToken(c.url))).toHaveLength(2);
  });

  it('signs in once for lookups that start together', async () => {
    const { lookup, calls } = build(ok);
    await Promise.all([lookup.lookup('AB12CDE'), lookup.lookup('XY99ZZZ')]);
    expect(calls.filter((c) => isToken(c.url))).toHaveLength(1);
  });

  it('renews a refused token once and tries again', async () => {
    let vehicleCalls = 0;
    const { lookup, calls } = build((url) => {
      if (isToken(url)) return reply(200, { access_token: `tok${calls.length}`, expires_in: 3599 });
      vehicleCalls += 1;
      return vehicleCalls === 1 ? reply(401) : reply(200, history);
    });
    expect(await lookup.lookup('AB12CDE')).toMatchObject({ ok: true });
    expect(calls.filter((c) => isToken(c.url))).toHaveLength(2);
  });

  it('says not found for an unknown registration', async () => {
    const { lookup } = build((url) =>
      isToken(url)
        ? reply(200, { access_token: 'tok', expires_in: 3599 })
        : reply(404, { errorCode: 'MOTH-NF-01' }),
    );
    expect(await lookup.lookup('ZZ99ABC')).toEqual({ ok: false, error: { tag: 'LookupNotFound' } });
  });

  it('says unavailable when sign-in fails, DVSA is down, or the network fails', async () => {
    const signInFails = build((url) => (isToken(url) ? reply(401) : reply(200, history)));
    expect(await signInFails.lookup.lookup('AB12CDE')).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
    for (const status of [429, 500, 503]) {
      const down = build((url) =>
        isToken(url) ? reply(200, { access_token: 'tok', expires_in: 3599 }) : reply(status),
      );
      expect(await down.lookup.lookup('AB12CDE')).toEqual({
        ok: false,
        error: { tag: 'LookupUnavailable' },
      });
    }
    const offline = new DvsaMotHistory(credentials, () => Promise.reject(new Error('offline')));
    expect(await offline.lookup('AB12CDE')).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
  });
});
