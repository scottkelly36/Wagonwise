import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { ItemType, Schedule } from '../domain/maintenance.js';
import type { StaffCaller } from './ports/directories.js';
import {
  getMyReminders,
  sendDueReminders,
  setMyReminders,
  type ReminderCompany,
  type ReminderDeps,
} from './reminders.js';
import { InMemoryItemTypeRepository } from './testing/in-memory-item-type-repository.js';
import {
  InMemoryPreferenceRepository,
  InMemoryReminderLog,
  RecordingMailer,
} from './testing/in-memory-reminders.js';
import { InMemoryScheduleRepository } from './testing/in-memory-schedule-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const van = makeId<'FleetVehicleId'>('van');
const mot = makeId<'MaintenanceItemId'>('mot');
const sam = makeId<'StaffId'>('50000000-0000-4000-8000-000000000001');
const pat = makeId<'StaffId'>('50000000-0000-4000-8000-000000000002');
const dee = makeId<'StaffId'>('50000000-0000-4000-8000-000000000003');
const kim = makeId<'StaffId'>('50000000-0000-4000-8000-000000000004');

const booker = (staffId: typeof sam, name: string) => ({
  staffId,
  name,
  email: `${name.toLowerCase()}@acme.test`,
  privileges: ['manage_maintenance', 'manage_fleet'],
});
const dispatcher = {
  staffId: dee,
  name: 'Dee',
  email: 'dee@acme.test',
  privileges: ['dispatch'],
};

const companies: ReminderCompany[] = [
  {
    id: acme,
    name: 'Acme Freight',
    recipients: [booker(sam, 'Sam'), booker(pat, 'Pat'), dispatcher],
  },
];

const motItem: ItemType = {
  id: mot,
  companyId: acme,
  name: 'MOT',
  intervalValue: 12,
  intervalUnit: 'months',
  warnDays: 28,
  appliesTo: 'all',
  vehicleIds: [],
  archivedAt: undefined,
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
  updatedAt: new Date('2026-10-01T09:00:00.000Z'),
};
const due = (dueDate: string): Schedule => ({
  vehicleId: van,
  itemTypeId: mot,
  dueDate,
  lastDone: undefined,
});

async function setup(now = '2026-10-09T08:30:00.000Z', dueDate: string | null = '2026-10-01') {
  const items = new InMemoryItemTypeRepository();
  const schedules = new InMemoryScheduleRepository();
  const preferences = new InMemoryPreferenceRepository();
  const log = new InMemoryReminderLog();
  const mailer = new RecordingMailer();
  const clock = new FakeClock(now);
  await items.save(motItem);
  if (dueDate !== null) await schedules.upsert(acme, due(dueDate), sam, clock.now());
  const deps: ReminderDeps = {
    items,
    schedules,
    preferences,
    log,
    mailer,
    clock,
    dashboardUrl: 'https://portal.example.com',
    vehicles: {
      listForCompany: () =>
        Promise.resolve([{ id: van, name: 'Big Van', registration: 'AB12CDE' }]),
      find: () => Promise.resolve(null),
    },
  };
  return { deps, mailer, preferences, log, clock };
}

describe('sendDueReminders', () => {
  it('emails each person who books vehicles in, once, when something is overdue', async () => {
    const { deps, mailer } = await setup();
    const result = await sendDueReminders(deps, companies);
    expect(result).toEqual({ sent: 2, failed: 0 });
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['pat@acme.test', 'sam@acme.test']);
    expect(mailer.sent[0]?.subject).toBe('Maintenance: 1 overdue (Acme Freight)');
    expect(mailer.sent[0]?.text).toContain('Big Van (AB12CDE): MOT, overdue by 8 days');
  });

  it('does not email someone who only dispatches: it is for those who can act on it', async () => {
    const { deps, mailer } = await setup();
    await sendDueReminders(deps, companies);
    expect(mailer.sent.some((m) => m.to === 'dee@acme.test')).toBe(false);
  });

  it('sends nothing when nothing is due, or when what is due is far off or has no date', async () => {
    for (const dueDate of ['2027-06-01', null]) {
      const { deps, mailer } = await setup(undefined, dueDate);
      expect(await sendDueReminders(deps, companies)).toEqual({ sent: 0, failed: 0 });
      expect(mailer.sent).toEqual([]);
    }
  });

  it('sends when something is due soon, inside its warning period', async () => {
    const { deps, mailer } = await setup(undefined, '2026-10-20');
    await sendDueReminders(deps, companies);
    expect(mailer.sent[0]?.subject).toBe('Maintenance: 1 due soon (Acme Freight)');
  });

  it('respects a choice of portal only, and a choice of email', async () => {
    const { deps, mailer, preferences } = await setup();
    await preferences.save(pat, acme, 'none', new Date());
    await preferences.save(sam, acme, 'email', new Date());
    await sendDueReminders(deps, companies);
    expect(mailer.sent.map((m) => m.to)).toEqual(['sam@acme.test']);
  });

  it('sends one a day however often it runs, and again the next day', async () => {
    const { deps, mailer, clock } = await setup();
    await sendDueReminders(deps, companies);
    await sendDueReminders(deps, companies);
    clock.set('2026-10-09T10:30:00.000Z');
    await sendDueReminders(deps, companies);
    expect(mailer.sent).toHaveLength(2);
    clock.set('2026-10-10T08:30:00.000Z');
    await sendDueReminders(deps, companies);
    expect(mailer.sent).toHaveLength(4);
  });

  it('waits until 7am UK time, which in summer is 06:00 UTC', async () => {
    const early = await setup('2026-10-09T05:30:00.000Z'); // 06:30 in the UK
    expect(await sendDueReminders(early.deps, companies)).toEqual({ sent: 0, failed: 0 });
    const ready = await setup('2026-10-09T06:00:00.000Z'); // 07:00 in the UK
    expect((await sendDueReminders(ready.deps, companies)).sent).toBe(2);
  });

  it('gives the day back when an email fails, so the next pass tries again and only that person is retried', async () => {
    const { deps, mailer } = await setup();
    mailer.failFor.add('pat@acme.test');
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 1, failed: 1 });
    mailer.failFor.clear();
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 1, failed: 0 });
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['pat@acme.test', 'sam@acme.test']);
  });

  it('keeps companies apart: a company with nothing due is not emailed, whatever another has', async () => {
    const { deps, mailer } = await setup();
    const other: ReminderCompany = {
      id: beta,
      name: 'Beta Haulage',
      recipients: [booker(kim, 'Kim')],
    };
    await sendDueReminders(deps, [other]);
    expect(mailer.sent).toEqual([]);
  });

  it('copes with no companies, and a company with nobody who books', async () => {
    const { deps, mailer } = await setup();
    expect(await sendDueReminders(deps, [])).toEqual({ sent: 0, failed: 0 });
    expect(
      await sendDueReminders(deps, [{ id: acme, name: 'Acme Freight', recipients: [dispatcher] }]),
    ).toEqual({ sent: 0, failed: 0 });
    expect(mailer.sent).toEqual([]);
  });
});

describe('a person’s own reminder choice', () => {
  const sams: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['manage_maintenance'] };
  const dees: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
  const admin: StaffCaller = { kind: 'platform' };

  it('is email until they choose, and then what they chose', async () => {
    const { deps } = await setup();
    expect(await getMyReminders(deps, sams, sam)).toEqual({ ok: true, value: 'email' });
    await setMyReminders(deps, sams, sam, 'none');
    expect(await getMyReminders(deps, sams, sam)).toEqual({ ok: true, value: 'none' });
  });

  it('is for those who book vehicles in, not other staff and not WagonWise admins', async () => {
    const { deps } = await setup();
    for (const caller of [dees, admin]) {
      expect(await getMyReminders(deps, caller, dee)).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
      expect(await setMyReminders(deps, caller, dee, 'none')).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
  });
});
