import { routeZoneSchema } from '@wagonwise/contracts/routing';
import { describe, expect, it } from 'vitest';
import { chargeToDto, routeZoneToDto } from './zone-dto.js';

describe('chargeToDto', () => {
  it('gives a penalty zone its first penalty', () => {
    expect(chargeToDto({ kind: 'penalty', firstGBP: 60 })).toEqual({
      kind: 'penalty',
      penaltyGBP: 60,
    });
  });

  it('gives a daily zone its charge, and London’s range', () => {
    expect(chargeToDto({ kind: 'daily', lowGBP: 100, highGBP: 300 })).toEqual({
      kind: 'daily',
      dailyChargeGBP: { lowGBP: 100, highGBP: 300 },
    });
  });
});

describe('routeZoneToDto', () => {
  it('sends a Scottish zone in the shape an older app already reads (name, status and the penalty)', () => {
    const dto = routeZoneToDto({
      id: 'glasgow',
      name: 'Glasgow Low Emission Zone',
      status: 'charged',
      charge: { kind: 'penalty', firstGBP: 60 },
    });
    expect(dto).toMatchObject({
      name: 'Glasgow Low Emission Zone',
      status: 'charged',
      penaltyGBP: 60,
    });
    expect(routeZoneSchema.safeParse(dto).success).toBe(true);
  });

  it('sends an English zone with a daily charge and no penalty', () => {
    const dto = routeZoneToDto({
      id: 'sheffield',
      name: 'Sheffield Clean Air Zone',
      status: 'may-be-charged',
      charge: { kind: 'daily', lowGBP: 50, highGBP: 50 },
    });
    expect(dto).not.toHaveProperty('penaltyGBP');
    expect(dto).toMatchObject({ kind: 'daily', dailyChargeGBP: { lowGBP: 50, highGBP: 50 } });
    expect(routeZoneSchema.safeParse(dto).success).toBe(true);
  });
});
