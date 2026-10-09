import { describe, expect, it } from 'vitest';
import { dayText, dueText, intervalText, vehicleLabel } from './maintenance';

describe('dueText', () => {
  it('says how late something is', () => {
    expect(dueText({ dueDate: '2026-10-01', daysUntil: -8, status: 'overdue' })).toBe(
      'Overdue by 8 days',
    );
    expect(dueText({ dueDate: '2026-10-08', daysUntil: -1, status: 'overdue' })).toBe(
      'Overdue by 1 day',
    );
  });

  it('says when it is due soon, and today', () => {
    expect(dueText({ dueDate: '2026-10-09', daysUntil: 0, status: 'due_soon' })).toBe('Due today');
    expect(dueText({ dueDate: '2026-10-14', daysUntil: 5, status: 'due_soon' })).toBe(
      'Due in 5 days',
    );
    expect(dueText({ dueDate: '2026-10-10', daysUntil: 1, status: 'due_soon' })).toBe(
      'Due in 1 day',
    );
  });

  it('gives the date when it is further off, and says so when there is none', () => {
    expect(dueText({ dueDate: '2027-03-12', daysUntil: 154, status: 'ok' })).toBe(
      'Due 12 Mar 2027',
    );
    expect(dueText({ dueDate: undefined, daysUntil: undefined, status: 'no_date' })).toBe(
      'No date yet',
    );
  });
});

describe('words', () => {
  it('says how often something repeats', () => {
    expect(intervalText({ intervalValue: 12, intervalUnit: 'months' })).toBe('every 12 months');
    expect(intervalText({ intervalValue: 1, intervalUnit: 'weeks' })).toBe('every week');
    expect(intervalText({ intervalValue: 6, intervalUnit: 'weeks' })).toBe('every 6 weeks');
  });

  it('writes a date, and a vehicle with its registration when it has one', () => {
    expect(dayText('2026-10-09')).toBe('9 Oct 2026');
    expect(vehicleLabel({ vehicleName: 'Big Van', registration: 'AB12CDE' })).toBe(
      'Big Van (AB12CDE)',
    );
    expect(vehicleLabel({ vehicleName: 'Big Wagon', registration: undefined })).toBe('Big Wagon');
  });
});
