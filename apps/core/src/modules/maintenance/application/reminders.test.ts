import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import type { ItemType, Schedule } from '../domain/maintenance.js';
import type { StaffCaller } from './ports/directories.js';
import {
  getMyMobile,
  getMyReminders,
  getReminderSettings,
  sendDueReminders,
  setMyMobile,
  setMyReminders,
  setReminderChannel,
  type ReminderCompany,
  type ReminderDeps,
} from './reminders.js';
import { InMemoryItemTypeRepository } from './testing/in-memory-item-type-repository.js';
import {
  InMemoryPreferenceRepository,
  InMemoryReminderLog,
  InMemoryReminderSettings,
  InMemoryTextCounter,
  RecordingMailer,
  RecordingTexter,
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
    expect(result).toEqual({ sent: 2, failed: 0, texts: 0 });
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
      expect(await sendDueReminders(deps, companies)).toEqual({ sent: 0, failed: 0, texts: 0 });
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
    expect(await sendDueReminders(early.deps, companies)).toEqual({ sent: 0, failed: 0, texts: 0 });
    const ready = await setup('2026-10-09T06:00:00.000Z'); // 07:00 in the UK
    expect((await sendDueReminders(ready.deps, companies)).sent).toBe(2);
  });

  it('gives the day back when an email fails, so the next pass tries again and only that person is retried', async () => {
    const { deps, mailer } = await setup();
    mailer.failFor.add('pat@acme.test');
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 1, failed: 1, texts: 0 });
    mailer.failFor.clear();
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 1, failed: 0, texts: 0 });
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
    expect(await sendDueReminders(deps, [])).toEqual({ sent: 0, failed: 0, texts: 0 });
    expect(
      await sendDueReminders(deps, [{ id: acme, name: 'Acme Freight', recipients: [dispatcher] }]),
    ).toEqual({ sent: 0, failed: 0, texts: 0 });
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

describe('reminder texts', () => {
  const SAM = '+447700900111';
  const PAT = '+447700900222';

  async function withTexts(options: { available?: boolean } = {}) {
    const base = await setup();
    const settings = new InMemoryReminderSettings();
    const counter = new InMemoryTextCounter();
    const texter = new RecordingTexter(options.available ?? true);
    const deps: ReminderDeps = { ...base.deps, settings, texts: counter, texter };
    await base.preferences.saveMobile(sam, acme, SAM, new Date());
    await base.preferences.saveMobile(pat, acme, PAT, new Date());
    return { ...base, deps, settings, counter, texter };
  }

  it('by default, and with email chosen, sends emails and no texts', async () => {
    const { deps, mailer, texter, settings } = await withTexts();
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 2, failed: 0, texts: 0 });
    expect(texter.sent).toEqual([]);
    expect(mailer.sent).toHaveLength(2);
    await settings.saveChannel(acme, 'email', sam, new Date());
    expect(texter.sent).toEqual([]);
  });

  it('with text chosen, texts each person who has a mobile, one short message, and no email', async () => {
    const { deps, mailer, texter, settings, counter } = await withTexts();
    await settings.saveChannel(acme, 'text', sam, new Date());
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 2, failed: 0, texts: 2 });
    expect(texter.sent.map((t) => t.to).sort()).toEqual([SAM, PAT]);
    expect(texter.sent[0]?.text).toBe(
      'WagonWise maintenance: 1 overdue (Acme Freight). Open the portal for details.',
    );
    expect(mailer.sent).toEqual([]);
    expect(await counter.sentInMonth(acme, '2026-10')).toBe(2);
  });

  it('with both chosen, sends the text and the email', async () => {
    const { deps, mailer, texter, settings } = await withTexts();
    await settings.saveChannel(acme, 'both', sam, new Date());
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 2, failed: 0, texts: 2 });
    expect(texter.sent).toHaveLength(2);
    expect(mailer.sent).toHaveLength(2);
  });

  it('sends the email instead to anyone with no mobile, so nobody is missed', async () => {
    const { deps, mailer, texter, settings, preferences } = await withTexts();
    await preferences.saveMobile(pat, acme, undefined, new Date());
    await settings.saveChannel(acme, 'text', sam, new Date());
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 2, failed: 0, texts: 1 });
    expect(texter.sent.map((t) => t.to)).toEqual([SAM]);
    expect(mailer.sent.map((m) => m.to)).toEqual(['pat@acme.test']);
  });

  it('falls back to the email when a text fails, and does not count it', async () => {
    const { deps, mailer, texter, settings, counter } = await withTexts();
    await settings.saveChannel(acme, 'text', sam, new Date());
    texter.failFor.add(SAM);
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 2, failed: 0, texts: 1 });
    expect(mailer.sent.map((m) => m.to)).toEqual(['sam@acme.test']);
    expect(await counter.sentInMonth(acme, '2026-10')).toBe(1);
  });

  it('goes by email when no text account is set up, even if the company chose text', async () => {
    const { deps, mailer, texter, settings } = await withTexts({ available: false });
    await settings.saveChannel(acme, 'text', sam, new Date());
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 2, failed: 0, texts: 0 });
    expect(texter.sent).toEqual([]);
    expect(mailer.sent).toHaveLength(2);
  });

  it('stops texting at the company’s monthly limit and sends emails after it', async () => {
    const { deps, mailer, texter, settings, counter } = await withTexts();
    await settings.saveChannel(acme, 'text', sam, new Date());
    await counter.add(acme, '2026-10', 99);
    expect(await sendDueReminders(deps, companies)).toEqual({ sent: 2, failed: 0, texts: 1 });
    expect(texter.sent).toHaveLength(1);
    expect(mailer.sent).toHaveLength(1);
    expect(await counter.sentInMonth(acme, '2026-10')).toBe(100);
    // A new month starts from none.
    expect(await counter.sentInMonth(acme, '2026-11')).toBe(0);
  });

  it('still respects portal only: no text and no email', async () => {
    const { deps, mailer, texter, settings, preferences } = await withTexts();
    await settings.saveChannel(acme, 'both', sam, new Date());
    await preferences.save(pat, acme, 'none', new Date());
    await sendDueReminders(deps, companies);
    expect(texter.sent.map((t) => t.to)).toEqual([SAM]);
    expect(mailer.sent.map((m) => m.to)).toEqual(['sam@acme.test']);
  });

  it('sends one a day: a person told by text is not told again when it runs again', async () => {
    const { deps, mailer, texter, settings } = await withTexts();
    await settings.saveChannel(acme, 'text', sam, new Date());
    await sendDueReminders(deps, companies);
    await sendDueReminders(deps, companies);
    expect(texter.sent).toHaveLength(2);
    expect(mailer.sent).toEqual([]);
  });
});

describe('the company’s choice and a person’s own mobile', () => {
  const bookerCaller: StaffCaller = {
    kind: 'fleet',
    companyId: acme,
    privileges: ['manage_maintenance'],
  };
  const otherCompany: StaffCaller = {
    kind: 'fleet',
    companyId: beta,
    privileges: ['manage_maintenance'],
  };
  const dispatchOnly: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };

  async function deps(available = true) {
    const base = await setup();
    return {
      ...base.deps,
      settings: new InMemoryReminderSettings(),
      texts: new InMemoryTextCounter(),
      texter: new RecordingTexter(available),
    };
  }

  it('shows the company email until it chooses, with how many texts it has used and whether texts work', async () => {
    const d = await deps();
    expect(await getReminderSettings(d, bookerCaller, acme)).toEqual({
      ok: true,
      value: { channel: 'email', textsAvailable: true, textsThisMonth: 0, textLimit: 100 },
    });
    expect((await getReminderSettings(await deps(false), bookerCaller, acme)).ok).toBe(true);
    const off = await getReminderSettings(await deps(false), bookerCaller, acme);
    expect(off.ok && off.value.textsAvailable).toBe(false);
  });

  it('lets someone who books maintenance change it, and nobody else, and not another company’s', async () => {
    const d = await deps();
    const changed = await setReminderChannel(d, bookerCaller, sam, acme, 'both');
    expect(changed.ok && changed.value.channel).toBe('both');
    for (const caller of [dispatchOnly, otherCompany]) {
      expect(await setReminderChannel(d, caller, sam, acme, 'text')).toEqual({
        ok: false,
        error: { tag: 'Forbidden' },
      });
    }
    expect((await getReminderSettings(d, otherCompany, acme)).ok).toBe(false);
    const admin = await setReminderChannel(d, { kind: 'platform' }, sam, acme, 'text');
    expect(admin.ok && admin.value.channel).toBe('text');
  });

  it('saves a UK mobile typed any usual way, shows it back, and removes it when emptied', async () => {
    const d = await deps();
    expect(await setMyMobile(d, bookerCaller, sam, '07700 900123')).toEqual({
      ok: true,
      value: '+447700900123',
    });
    expect(await getMyMobile(d, bookerCaller, sam)).toEqual({ ok: true, value: '+447700900123' });
    // Saving the mobile does not change whether they are reminded.
    expect(await getMyReminders(d, bookerCaller, sam)).toEqual({ ok: true, value: 'email' });
    expect(await setMyMobile(d, bookerCaller, sam, '  ')).toEqual({ ok: true, value: undefined });
    expect(await getMyMobile(d, bookerCaller, sam)).toEqual({ ok: true, value: undefined });
  });

  it('refuses something that is not a UK mobile, and anyone who does not book maintenance', async () => {
    const d = await deps();
    expect(await setMyMobile(d, bookerCaller, sam, '01434 600000')).toEqual({
      ok: false,
      error: { tag: 'InvalidMobile', reason: 'not_a_uk_mobile' },
    });
    expect(await setMyMobile(d, dispatchOnly, dee, '07700 900123')).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await setMyReminders(d, bookerCaller, sam, 'none')).toEqual({ ok: true, value: 'none' });
  });
});
