import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import type { OverviewRow } from './maintenance.js';
import { buildReminder, isChannel, needsReminder, ukHour } from './reminders.js';

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
