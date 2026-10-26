import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { OverviewRow } from './maintenance.js';
import {
  buildReminder,
  isChannel,
  needsReminder,
  ukHour,
  buildTextReminder,
  normaliseUkMobile,
  ukMonth,
} from './reminders.js';

const row = (over: Partial<OverviewRow>): OverviewRow => ({
  vehicleId: makeId<'FleetVehicleId'>('v1'),
  vehicleName: 'Big Van',
  registration: 'AB12CDE',
  itemTypeId: makeId<'MaintenanceItemId'>('mot'),
  itemName: 'MOT',
  dueDate: '2026-10-01',
  lastDone: undefined,
  status: 'overdue',
  daysUntil: -8,
  ...over,
});

describe('needsReminder', () => {
  it('is for overdue and due soon, not for fine items or items with no date', () => {
    expect(needsReminder({ status: 'overdue' })).toBe(true);
    expect(needsReminder({ status: 'due_soon' })).toBe(true);
    expect(needsReminder({ status: 'ok' })).toBe(false);
    expect(needsReminder({ status: 'no_date' })).toBe(false);
  });
});

describe('ukHour', () => {
  it('is the hour in the UK, an hour ahead of UTC in summer', () => {
    expect(ukHour(new Date('2026-07-01T06:30:00.000Z'))).toBe(7);
    expect(ukHour(new Date('2026-12-01T06:30:00.000Z'))).toBe(6);
    expect(ukHour(new Date('2026-07-01T23:30:00.000Z'))).toBe(0);
  });
});

describe('channels', () => {
  it('knows email and none, and nothing else yet', () => {
    expect(isChannel('email')).toBe(true);
    expect(isChannel('none')).toBe(true);
    expect(isChannel('sms')).toBe(false);
  });
});

describe('buildReminder', () => {
  const base = {
    name: 'Sam',
    companyName: 'Acme Freight',
    dashboardUrl: 'https://portal.example.com/',
  };

  it('says nothing on a quiet day', () => {
    expect(buildReminder({ ...base, rows: [] })).toBeUndefined();
    expect(
      buildReminder({
        ...base,
        rows: [row({ status: 'ok', daysUntil: 200 }), row({ status: 'no_date' })],
      }),
    ).toBeUndefined();
  });

  it('lists what is overdue first, then what is due soon, with the registration and how late or soon', () => {
    const reminder = buildReminder({
      ...base,
      rows: [
        row({}),
        row({
          vehicleName: 'Big Wagon',
          registration: undefined,
          itemName: 'Service',
          dueDate: '2026-10-14',
          status: 'due_soon',
          daysUntil: 5,
        }),
        row({ itemName: 'Road tax', dueDate: '2026-10-09', status: 'due_soon', daysUntil: 0 }),
      ],
    });
    expect(reminder?.subject).toBe('Maintenance: 1 overdue, 2 due soon (Acme Freight)');
    expect(reminder?.text).toContain('Hi Sam,');
    expect(reminder?.text).toContain(
      'Overdue:\n  Big Van (AB12CDE): MOT, overdue by 8 days (was due 1 Oct 2026)',
    );
    expect(reminder?.text).toContain('Big Wagon: Service, due in 5 days (14 Oct 2026)');
    expect(reminder?.text).toContain('Big Van (AB12CDE): Road tax, due today');
    expect(reminder?.text.indexOf('Overdue:')).toBeLessThan(
      reminder?.text.indexOf('Due soon:') ?? 0,
    );
  });

  it('counts a single item in the subject, and leaves out the empty group', () => {
    const reminder = buildReminder({ ...base, rows: [row({})] });
    expect(reminder?.subject).toBe('Maintenance: 1 overdue (Acme Freight)');
    expect(reminder?.text).not.toContain('Due soon:');
  });

  it('links to the Maintenance page when the portal address is known, once, without a doubled slash', () => {
    const withLink = buildReminder({ ...base, rows: [row({})] });
    expect(withLink?.text).toContain('https://portal.example.com/fleet/maintenance');
    const without = buildReminder({ ...base, dashboardUrl: undefined, rows: [row({})] });
    expect(without?.text).not.toContain('fleet/maintenance');
  });

  it('tells the person how to stop getting it', () => {
    expect(buildReminder({ ...base, rows: [row({})] })?.text).toContain('switch it off');
  });
});

describe('normaliseUkMobile', () => {
  it.each([
    ['07700 900123', '+447700900123'],
    ['07700900123', '+447700900123'],
    ['+447700900123', '+447700900123'],
    ['+44 7700 900123', '+447700900123'],
    ['+44 (0)7700 900123', '+447700900123'],
    ['0044 7700 900123', '+447700900123'],
    ['07700-900-123', '+447700900123'],
  ])('reads %j as %j', (raw, mobile) => {
    expect(normaliseUkMobile(raw)).toBe(mobile);
  });

  it.each([
    '',
    '01434 600000',
    '0207 946 0000',
    '07000 123456',
    '0770090012',
    '07700 9001234',
    'pat@example.com',
    '+1 202 555 0100',
  ])('refuses %j: not a UK mobile that can be texted', (raw) => {
    expect(normaliseUkMobile(raw)).toBeUndefined();
  });
});

describe('ukMonth', () => {
  it('is the month in UK time, so the end of the month in summer moves on an hour early', () => {
    expect(ukMonth(new Date('2026-10-14T08:00:00.000Z'))).toBe('2026-10');
    expect(ukMonth(new Date('2026-07-31T23:30:00.000Z'))).toBe('2026-08');
    expect(ukMonth(new Date('2026-01-31T23:30:00.000Z'))).toBe('2026-01');
  });
});

describe('buildTextReminder', () => {
  const row = (status: 'overdue' | 'due_soon' | 'ok') => ({ status }) as never;

  it('says how many are overdue and due soon in one short text, and nothing on a quiet day', () => {
    const text = buildTextReminder({
      companyName: 'Acme Freight',
      rows: [row('overdue'), row('overdue'), row('due_soon')],
    });
    expect(text).toBe(
      'WagonWise maintenance: 2 overdue, 1 due soon (Acme Freight). Open the portal for details.',
    );
    expect(buildTextReminder({ companyName: 'Acme', rows: [row('ok')] })).toBeUndefined();
    expect(buildTextReminder({ companyName: 'Acme', rows: [] })).toBeUndefined();
  });

  it('stays within one text message even for a long company name', () => {
    const text = buildTextReminder({
      companyName: 'A very long haulage company name that goes on and on and on and on',
      rows: [row('overdue')],
    });
    expect(text?.length).toBeLessThanOrEqual(160);
  });
});
