import { describe, expect, it } from 'vitest';
import {
  datesFromResponse,
  DvlaVehicleEnquiry,
  normaliseRegistration,
  NotConfiguredVehicleLookup,
} from './dvla-vehicle-enquiry.js';

const reply = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('datesFromResponse', () => {
  it('reads the MOT and tax dates and statuses', () => {
    expect(
      datesFromResponse({
        motExpiryDate: '2027-03-01',
        taxDueDate: '2026-12-01',
        motStatus: 'Valid',
        taxStatus: 'Taxed',
        make: 'VOLVO',
      }),
    ).toEqual({
      motExpiry: '2027-03-01',
      taxDue: '2026-12-01',
      motStatus: 'Valid',
      taxStatus: 'Taxed',
    });
  });

  it('leaves out what is missing or not a real day', () => {
    expect(
      datesFromResponse({ motExpiryDate: '2027-02-30', motStatus: 'No details held by DVLA' }),
    ).toEqual({
      motExpiry: undefined,
      taxDue: undefined,
      motStatus: 'No details held by DVLA',
      taxStatus: undefined,
    });
    expect(datesFromResponse(null)).toEqual({
      motExpiry: undefined,
      taxDue: undefined,
      motStatus: undefined,
      taxStatus: undefined,
    });
  });
});

describe('normaliseRegistration', () => {
  it('drops spaces and capitalises', () => {
    expect(normaliseRegistration(' ab12 cde ')).toBe('AB12CDE');
  });
});

describe('DvlaVehicleEnquiry', () => {
  it('posts the registration with the key and returns the dates', async () => {
    let seen: RequestInit | undefined;
    const lookup = new DvlaVehicleEnquiry('secret', (_url, init) => {
      seen = init;
      return Promise.resolve(reply(200, { motExpiryDate: '2027-03-01' }));
    });
    const result = await lookup.lookup('ab12 cde');
    expect(result).toMatchObject({ ok: true, value: { motExpiry: '2027-03-01' } });
    expect(seen?.method).toBe('POST');
    expect((seen?.headers as Record<string, string>)['x-api-key']).toBe('secret');
    expect(seen?.body).toBe('{"registrationNumber":"AB12CDE"}');
  });

  it('says not found for 404 and 400', async () => {
    for (const status of [404, 400]) {
      const lookup = new DvlaVehicleEnquiry('k', () => Promise.resolve(reply(status)));
      expect(await lookup.lookup('AB12CDE')).toEqual({
        ok: false,
        error: { tag: 'LookupNotFound' },
      });
    }
  });

  it('says unavailable for a busy or broken service, a bad key or a network failure', async () => {
    for (const status of [403, 429, 500, 503]) {
      const lookup = new DvlaVehicleEnquiry('k', () => Promise.resolve(reply(status)));
      expect(await lookup.lookup('AB12CDE')).toEqual({
        ok: false,
        error: { tag: 'LookupUnavailable' },
      });
    }
    const down = new DvlaVehicleEnquiry('k', () => Promise.reject(new Error('offline')));
    expect(await down.lookup('AB12CDE')).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
  });

  it('is off without a key', () => {
    expect(new NotConfiguredVehicleLookup().configured).toBe(false);
    expect(new DvlaVehicleEnquiry('k').configured).toBe(true);
  });
});
