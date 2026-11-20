import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimReward,
  eraseDriverReferrals,
  listReferrals,
  lookupCode,
  myReferrals,
  recordReferral,
  setReferralStatus,
  type ReferralDeps,
} from './referrals.js';
import { InMemoryReferralCodes, InMemoryReferrals } from './testing/in-memory-referrals.js';

const platform = { kind: 'platform' } as const;
const fleet = { kind: 'fleet', companyId: 'c1', privileges: [] } as const;
let deps: ReferralDeps & { codes: InMemoryReferralCodes; referrals: InMemoryReferrals };
let n = 0;

beforeEach(() => {
  n = 0;
  let r = 0;
  deps = {
    codes: new InMemoryReferralCodes(),
    referrals: new InMemoryReferrals(),
    ids: { newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` },
    clock: { now: () => new Date('2026-11-20T10:00:00.000Z') },
    random: () => (r++ % 7) / 7,
  };
});

describe('a driver’s code', () => {
  it('is made on first ask and the same afterwards', async () => {
    const first = await myReferrals(deps, 'd1');
    const again = await myReferrals(deps, 'd1');
    expect(first.code).toMatch(/^WW-[A-HJKMNP-Z2-9]{6}$/);
    expect(again.code).toBe(first.code);
  });

  it('is tried again when it clashes with another driver’s', async () => {
    // The first code drawn is all As, which another driver already has; the next draw is all Bs.
    deps.codes.byDriver.set('other', 'WW-AAAAAA');
    let calls = 0;
    deps = { ...deps, random: () => (calls++ < 6 ? 0 : 1 / 31) };
    const { code } = await myReferrals(deps, 'd1');
    expect(code).toBe('WW-BBBBBB');
    expect(deps.codes.byDriver.get('other')).toBe('WW-AAAAAA');
  });
});

describe('recording and paying out', () => {
  it('goes from signed up to due to claimed to sent, one firm once', async () => {
    const { code } = await myReferrals(deps, 'd1');
    const made = await recordReferral(deps, platform, { code, firmName: 'Tyne Haulage Ltd' });
    expect(made.ok && made.value.status).toBe('signed_up');
    if (!made.ok) return;
    expect(
      await recordReferral(deps, platform, { code, firmName: 'tyne haulage limited' }),
    ).toEqual({
      ok: false,
      error: { tag: 'AlreadyReferred' },
    });

    // Not claimable until the firm has paid.
    expect((await claimReward(deps, 'd1', made.value.id, 'dave@example.com')).ok).toBe(false);
    expect((await setReferralStatus(deps, platform, made.value.id, 'reward_due')).ok).toBe(true);
    // Only by the driver whose referral it is.
    expect(await claimReward(deps, 'd2', made.value.id, 'x@example.com')).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    const claimed = await claimReward(deps, 'd1', made.value.id, ' dave@example.com ');
    expect(claimed.ok && claimed.value.rewardEmail).toBe('dave@example.com');
    expect((await setReferralStatus(deps, platform, made.value.id, 'sent')).ok).toBe(true);
    expect(await setReferralStatus(deps, platform, made.value.id, 'void')).toEqual({
      ok: false,
      error: { tag: 'WrongStatus' },
    });
  });

  it('lets a firm be recorded again once its earlier referral was voided', async () => {
    const { code } = await myReferrals(deps, 'd1');
    const made = await recordReferral(deps, platform, { code, firmName: 'A Firm' });
    if (!made.ok) throw new Error('not made');
    await setReferralStatus(deps, platform, made.value.id, 'void');
    expect((await recordReferral(deps, platform, { code, firmName: 'A Firm' })).ok).toBe(true);
  });

  it('refuses an unknown code, and anyone but WagonWise staff', async () => {
    expect(await recordReferral(deps, platform, { code: 'WW-ZZZZZZ', firmName: 'X' })).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
    expect(await listReferrals(deps, fleet)).toEqual({ ok: false, error: { tag: 'Forbidden' } });
    expect(await lookupCode(deps, fleet, 'WW-ZZZZZZ')).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('erases a deleted driver’s code and referrals', async () => {
    const { code } = await myReferrals(deps, 'd1');
    await recordReferral(deps, platform, { code, firmName: 'A Firm' });
    await eraseDriverReferrals(deps, 'd1');
    expect(deps.codes.byDriver.size).toBe(0);
    expect(deps.referrals.rows.size).toBe(0);
  });
});
