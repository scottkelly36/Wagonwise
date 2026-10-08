import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { CompanyId } from '../domain/company.js';
import type { Actor } from '../domain/staff-account.js';
import { getCompanySettings, updateCompanySettings } from './company-settings.js';
import { InMemoryCompanyRepository } from './testing/in-memory-company-repository.js';
import { InMemoryStaffAuditLog } from './testing/in-memory-staff-repositories.js';

const ACME = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const OTHER = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('99999999-9999-4999-8999-999999999999');

const platform: Actor = { kind: 'platform', staffId };
const manager: Actor = { kind: 'fleet', staffId, companyId: ACME, privileges: ['manage_users'] };
const dispatcher: Actor = { kind: 'fleet', staffId, companyId: ACME, privileges: ['dispatch'] };

async function setup() {
  const companies = new InMemoryCompanyRepository();
  for (const id of [ACME, OTHER] as CompanyId[]) {
    await companies.save({
      id,
      name: id === ACME ? 'Acme' : 'Other',
      createdAt: new Date('2026-09-27T08:00:00.000Z'),
      photoRetentionMonths: 12,
    });
  }
  const auditLog = new InMemoryStaffAuditLog();
  const deps = {
    companies,
    auditLog,
    clock: new FakeClock('2026-10-08T12:00:00.000Z'),
    ids: new SequentialIdGenerator(),
  };
  return { deps, auditLog };
}

describe('getCompanySettings', () => {
  it('shows a company its own setting, and WagonWise staff any', async () => {
    const { deps } = await setup();
    expect(await getCompanySettings(deps, dispatcher, ACME)).toEqual({
      ok: true,
      value: { photoRetentionMonths: 12 },
    });
    expect((await getCompanySettings(deps, platform, OTHER)).ok).toBe(true);
  });

  it('refuses another company, and says when there is none', async () => {
    const { deps } = await setup();
    expect(await getCompanySettings(deps, dispatcher, OTHER)).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    const missing = makeId<'CompanyId'>('33333333-3333-4333-8333-333333333333');
    expect(await getCompanySettings(deps, platform, missing)).toEqual({
      ok: false,
      error: { tag: 'CompanyNotFound' },
    });
  });
});

describe('updateCompanySettings', () => {
  it("lets a manager change their company's photo retention, and audits it", async () => {
    const { deps, auditLog } = await setup();
    const result = await updateCompanySettings(deps, manager, ACME, { photoRetentionMonths: 6 });
    expect(result).toEqual({ ok: true, value: { photoRetentionMonths: 6 } });
    expect((await deps.companies.findById(ACME))?.photoRetentionMonths).toBe(6);
    expect(auditLog.entries).toHaveLength(1);
    expect(auditLog.entries[0]).toMatchObject({
      action: 'company_settings_changed',
      companyId: ACME,
      details: { photoRetentionMonthsBefore: '12', photoRetentionMonthsAfter: '6' },
    });
  });

  it('lets WagonWise staff change any company', async () => {
    const { deps } = await setup();
    expect(
      (await updateCompanySettings(deps, platform, OTHER, { photoRetentionMonths: 24 })).ok,
    ).toBe(true);
  });

  it('refuses someone without manage_users, and another company even for a manager', async () => {
    const { deps, auditLog } = await setup();
    expect(
      await updateCompanySettings(deps, dispatcher, ACME, { photoRetentionMonths: 6 }),
    ).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await updateCompanySettings(deps, manager, OTHER, { photoRetentionMonths: 6 })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect((await deps.companies.findById(ACME))?.photoRetentionMonths).toBe(12);
    expect(auditLog.entries).toEqual([]);
  });

  it('refuses a period that is not between 1 and 120 whole months', async () => {
    const { deps } = await setup();
    for (const photoRetentionMonths of [0, 121, 1.5, -3]) {
      expect(await updateCompanySettings(deps, manager, ACME, { photoRetentionMonths })).toEqual({
        ok: false,
        error: { tag: 'InvalidSetting' },
      });
    }
  });
});
