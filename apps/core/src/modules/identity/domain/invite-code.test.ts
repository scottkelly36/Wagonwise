import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { isRedeemed, redeem, type InviteCode } from './invite-code.js';

const driverId = makeId<'DriverId'>('driver-1');
const now = new Date('2026-06-15T08:00:00.000Z');

function unredeemedCode(): InviteCode {
  return {
    code: 'HEXHAM24',
    redeemedBy: null,
    redeemedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('isRedeemed', () => {
  it('is false for a fresh code', () => {
    expect(isRedeemed(unredeemedCode())).toBe(false);
  });

  it('is true once redeemedBy is set', () => {
    const code = { ...unredeemedCode(), redeemedBy: driverId, redeemedAt: now };
    expect(isRedeemed(code)).toBe(true);
  });
});

describe('redeem', () => {
  it('sets redeemedBy and redeemedAt on a fresh code', () => {
    const result = redeem(unredeemedCode(), driverId, now);
    expect(result).toEqual({
      ok: true,
      value: { ...unredeemedCode(), redeemedBy: driverId, redeemedAt: now },
    });
  });

  it('rejects redeeming an already-redeemed code, even by the same driver', () => {
    const alreadyRedeemed: InviteCode = {
      ...unredeemedCode(),
      redeemedBy: driverId,
      redeemedAt: now,
    };
    const result = redeem(alreadyRedeemed, driverId, now);
    expect(result).toEqual({ ok: false, error: { tag: 'InviteCodeAlreadyRedeemed' } });
  });

  it('does not mutate the original code', () => {
    const original = unredeemedCode();
    redeem(original, driverId, now);
    expect(isRedeemed(original)).toBe(false);
  });
});
