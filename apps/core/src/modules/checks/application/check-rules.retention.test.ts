import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { DEFAULT_SETTINGS } from '../domain/settings.js';
import {
  getCheckSettings,
  pruneOldChecks,
  updateCheckSettings,
  type CheckRulesDeps,
} from './check-rules.js';
import type { StaffCaller } from './ports/directories.js';
import { InMemoryCheckRepository } from './testing/in-memory-check-repository.js';
import { InMemoryOfficeCheckRepository } from './testing/in-memory-office-check-repository.js';
import { InMemorySettingsRepository } from './testing/in-memory-settings-repository.js';
import { InMemoryTemplateRepository } from './testing/in-memory-template-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const staffId = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const manager: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_fleet'] };
const viewer: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };

function setup() {
  const settings = new InMemorySettingsRepository();
  const checks = new InMemoryCheckRepository();
  const clock = new FakeClock('2026-10-09T09:00:00.000Z');
  const deps: CheckRulesDeps = {
    settings,
    templates: new InMemoryTemplateRepository(),
    checks,
    office: new InMemoryOfficeCheckRepository(),
    clock,
  };
  return { deps, settings, checks, clock };
}

describe('retention', () => {
  it('is 12 months until the firm chooses, and the firm can change it, keeping it when left out', async () => {
    const { deps } = setup();
    const read = await getCheckSettings(deps, viewer, acme);
    expect(read.ok && read.value.retentionMonths).toBe(12);

    const rules = { requiredBeforeJob: false, blockOnDoNotDrive: false };
    const longer = await updateCheckSettings(deps, manager, staffId, acme, {
      ...rules,
      retentionMonths: 24,
    });
    expect(longer.ok && longer.value.retentionMonths).toBe(24);

    const kept = await updateCheckSettings(deps, manager, staffId, acme, {
      requiredBeforeJob: true,
      blockOnDoNotDrive: false,
    });
    expect(kept.ok && [kept.value.requiredBeforeJob, kept.value.retentionMonths]).toEqual([
      true,
      24,
    ]);
  });

  it('refuses a retention outside 1 to 120 whole months, and saves nothing', async () => {
    const { deps } = setup();
    const rules = { requiredBeforeJob: true, blockOnDoNotDrive: true };
    for (const bad of [0, 121, 1.5, -3]) {
      expect(
        await updateCheckSettings(deps, manager, staffId, acme, { ...rules, retentionMonths: bad }),
      ).toEqual({ ok: false, error: { tag: 'InvalidRetention' } });
    }
    const read = await getCheckSettings(deps, viewer, acme);
    expect(read.ok && read.value).toEqual(DEFAULT_SETTINGS);
  });
});

describe('pruneOldChecks', () => {
  it('deletes each company’s checks older than its own retention: 12 months by default, or what it chose', async () => {
    const { settings, checks, clock } = setup();
    await settings.save(beta, { ...DEFAULT_SETTINGS, retentionMonths: 3 }, staffId);
    checks.deleteResult = 2;
    const removed = await pruneOldChecks({ settings, checks, clock }, [acme, beta]);
    expect(removed).toBe(4);
    expect(checks.deleteCalls).toEqual([
      { companyId: acme, cutoff: new Date('2025-10-09T09:00:00.000Z') },
      { companyId: beta, cutoff: new Date('2026-07-09T09:00:00.000Z') },
    ]);
  });

  it('does nothing for no companies', async () => {
    const { settings, checks, clock } = setup();
    expect(await pruneOldChecks({ settings, checks, clock }, [])).toBe(0);
    expect(checks.deleteCalls).toEqual([]);
  });
});
