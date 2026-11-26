import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { reminderStage } from '../domain/reminders.js';
import type { FirmSettings } from '../domain/tachograph.js';
import {
  deliverReminders,
  planReminders,
  type CompanyPlan,
  type ReminderCompany,
} from './reminders.js';
import {
  FakeMailer,
  FakePusher,
  FakeReminderDirectory,
  InMemoryFiles,
  InMemoryReminderLog,
  InMemorySettings,
} from './testing/in-memory.js';

const ACME = makeId<'CompanyId'>('acme');
const SAM = makeId<'DriverId'>('sam');
const manager = {
  staffId: makeId<'StaffId'>('boss'),
  name: 'Alex',
  email: 'alex@acme.test',
  privileges: ['manage_fleet'],
};
const dispatcher = {
  staffId: makeId<'StaffId'>('disp'),
  name: 'Dee',
  email: 'dee@acme.test',
  privileges: ['dispatch'],
};
const company = (recipients = [manager, dispatcher]): ReminderCompany => ({
  id: ACME,
  name: 'Acme Haulage',
  recipients,
});

function build(now = '2026-11-26T08:00:00.000Z') {
  const clock = new FakeClock(now);
  const settings = new InMemorySettings();
  const files = new InMemoryFiles();
  const log = new InMemoryReminderLog();
  const pusher = new FakePusher();
  const mailer = new FakeMailer();
  const deps = {
    settings,
    files,
    log,
    clock,
    directory: new FakeReminderDirectory(),
    pusher,
    mailer,
    dashboardUrl: 'https://dashboard.example.test/',
  };
  const setSettings = (s: Partial<FirmSettings>) =>
    settings.byCompany.set(ACME, {
      driversMaySend: true,
      retentionMonths: 12,
      remindersEnabled: true,
      ...s,
    });
  setSettings({});
  let n = 0;
  const addFile = async (
    kind: 'driver_card' | 'vehicle_unit',
    subject: string,
    downloadedOn: string,
  ) => {
    await files.add({
      id: `f${++n}`,
      companyId: ACME,
      kind,
      driverId: kind === 'driver_card' ? (subject as never) : undefined,
      vehicleId: kind === 'vehicle_unit' ? subject : undefined,
      fileName: 'f.ddd',
      data: Buffer.from(`file ${n}`),
      sha256: `hash-${n}`,
      downloadedOn,
      receivedAt: new Date('2026-11-01T00:00:00Z'),
    });
  };
  const run = async (companies = [company()]) => {
    const plans = await planReminders(deps, companies);
    return { plans, ...(await deliverReminders(deps, plans)) };
  };
  return { deps, clock, files, log, pusher, mailer, setSettings, addFile, run };
}

describe('reminderStage', () => {
  const at = (daysLeft?: number) =>
    reminderStage(
      daysLeft === undefined
        ? { state: 'no_file' }
        : { state: 'ok', dueOn: '2026-12-01', daysLeft },
    );

  it('says nothing until the last week, nor with no file', () => {
    expect(at(undefined)).toBeUndefined();
    expect(at(30)).toBeUndefined();
    expect(at(8)).toBeUndefined();
  });

  it('goes soon, urgent, today, then once a week overdue', () => {
    expect([7, 3].map(at)).toEqual(['soon', 'soon']);
    expect([2, 1].map(at)).toEqual(['urgent', 'urgent']);
    expect(at(0)).toBe('today');
    expect([-1, -7].map(at)).toEqual(['overdue-0', 'overdue-0']);
    expect([-8, -14].map(at)).toEqual(['overdue-1', 'overdue-1']);
    expect(at(-15)).toBe('overdue-2');
  });
});

describe('due download reminders', () => {
  it('emails the people who manage the fleet, and pushes the driver about their own card', async () => {
    const t = build();
    await t.addFile('driver_card', SAM, '2026-11-05'); // due 3 Dec: 7 days left
    t.pusher.devices.set(SAM, 1);
    const { outcome } = await t.run();
    expect(outcome).toEqual({ emailed: 1, pushed: 1, failed: 0 });
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]?.to).toBe('alex@acme.test');
    expect(t.mailer.sent[0]?.subject).toBe('Tachograph downloads due soon: Acme Haulage');
    expect(t.mailer.sent[0]?.text).toContain('Driver sam (driver card): due by 3 Dec 2026');
    expect(t.mailer.sent[0]?.text).toContain('https://dashboard.example.test/fleet/tachograph');
    expect(t.pusher.sent[0]).toMatchObject({ driverId: SAM, title: 'Tachograph download due' });
    expect(t.pusher.sent[0]?.body).toContain('Send my tachograph file');
  });

  it('says overdue in the subject, and never says compliant', async () => {
    const t = build();
    await t.addFile('vehicle_unit', 'v1', '2026-08-01'); // due 30 Oct: 27 days over
    const { outcome } = await t.run();
    expect(outcome.emailed).toBe(1);
    expect(t.mailer.sent[0]?.subject).toBe('Tachograph downloads overdue: Acme Haulage');
    expect(t.mailer.sent[0]?.text).toContain('Vehicle v1 (vehicle unit): 27 days overdue');
    expect(t.mailer.sent[0]?.text.toLowerCase()).not.toContain('complian');
    expect(t.pusher.sent).toHaveLength(0); // a vehicle unit is not a driver's to send
  });

  it('sends each stage once, and starts again with a new file', async () => {
    const t = build();
    await t.addFile('driver_card', SAM, '2026-11-05');
    await t.run();
    expect((await t.run()).plans).toEqual([]);
    expect(t.mailer.sent).toHaveLength(1);

    t.clock.set('2026-12-02T08:00:00.000Z'); // 1 day left: urgent
    await t.run();
    expect(t.mailer.sent).toHaveLength(2);

    await t.addFile('driver_card', SAM, '2026-12-02'); // a new file: due 30 Dec
    await t.run();
    expect(t.mailer.sent).toHaveLength(2);
    t.clock.set('2026-12-24T08:00:00.000Z'); // 6 days left on the new one: soon, a fresh count
    await t.run();
    expect(t.mailer.sent).toHaveLength(3);
  });

  it('jumps to the stage it is at after a gap, not through the ones missed', async () => {
    const t = build('2026-12-10T08:00:00.000Z');
    await t.addFile('driver_card', SAM, '2026-11-05'); // due 3 Dec: 7 days over
    await t.run();
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.sent[0]?.text).toContain('7 days overdue');
  });

  it('waits until 7am UK, and does nothing for a firm that has switched reminders off', async () => {
    const early = build('2026-11-26T06:30:00.000Z');
    await early.addFile('driver_card', SAM, '2026-11-05');
    expect((await early.run()).plans).toEqual([]);
    early.clock.set('2026-11-26T07:00:00.000Z');
    expect((await early.run()).plans).toHaveLength(1);

    const off = build();
    off.setSettings({ remindersEnabled: false });
    await off.addFile('driver_card', SAM, '2026-11-05');
    expect((await off.run()).plans).toEqual([]);
  });

  it('does not push drivers when the firm has not let them send files, but still emails the office', async () => {
    const t = build();
    t.setSettings({ driversMaySend: false });
    await t.addFile('driver_card', SAM, '2026-11-05');
    t.pusher.devices.set(SAM, 1);
    const { outcome } = await t.run();
    expect(outcome).toEqual({ emailed: 1, pushed: 0, failed: 0 });
  });

  it('is only for drivers and vehicles that have sent a file, with nothing about those with none', async () => {
    const t = build();
    expect((await t.run()).plans).toEqual([]);
  });

  it('gives the records back when someone could be told and no one was, so the next pass tries again', async () => {
    const t = build();
    await t.addFile('driver_card', SAM, '2026-11-05');
    t.mailer.fail = true;
    const first = await t.run();
    expect(first.outcome.failed).toBe(1);
    expect(first.release).toHaveLength(1);
    await t.log.release(first.release);
    t.mailer.fail = false;
    expect((await t.run()).outcome.emailed).toBe(1);
  });

  it('keeps the records when no one can be told at all, so it does not try every hour for nothing', async () => {
    const t = build();
    await t.addFile('driver_card', SAM, '2026-11-05'); // the driver has no phone registered
    const { release, outcome } = await t.run([company([dispatcher])]); // and no one manages the fleet
    expect(outcome).toEqual({ emailed: 0, pushed: 0, failed: 0 });
    expect(release).toEqual([]);
  });

  it('does not email a person who only dispatches', async () => {
    const t = build();
    await t.addFile('driver_card', SAM, '2026-11-05');
    await t.run();
    expect(t.mailer.sent.map((m) => m.to)).toEqual(['alex@acme.test']);
  });
});

describe('plans', () => {
  it('say what is to be sent for each company', async () => {
    const t = build();
    await t.addFile('driver_card', SAM, '2026-11-05');
    const plans: CompanyPlan[] = await planReminders(t.deps, [company()]);
    expect(plans[0]?.items[0]).toMatchObject({
      kind: 'driver_card',
      subjectId: SAM,
      stage: 'soon',
      dueOn: '2026-12-03',
      daysLeft: 7,
    });
    expect(plans[0]?.pushDrivers).toBe(true);
  });
});
