import { describe, expect, it } from 'vitest';
import { driverDisplayName, driverNamesById, driverSubtext } from './driver-name';

describe('driverDisplayName', () => {
  it('prefers the company label, then the driver name, then the sign-in', () => {
    const base = { driverId: 'd1', driverIdentifier: '07700900123' };
    expect(driverDisplayName({ ...base, label: 'Dave (artic 3)', driverName: 'David Kelly' })).toBe(
      'Dave (artic 3)',
    );
    expect(driverDisplayName({ ...base, driverName: 'David Kelly' })).toBe('David Kelly');
    expect(driverDisplayName(base)).toBe('07700900123');
  });

  it('shows the invited identifier for an invitation with no driver yet, and the id as a last resort', () => {
    expect(driverDisplayName({ invitedIdentifier: 'pat@example.com' })).toBe('pat@example.com');
    expect(driverDisplayName({ driverId: 'd1' })).toBe('d1');
  });
});

describe('driverSubtext', () => {
  it('shows the sign-in under a name, and nothing when it is the name', () => {
    expect(driverSubtext({ driverName: 'David Kelly', driverIdentifier: '07700900123' })).toBe(
      '07700900123',
    );
    expect(driverSubtext({ driverIdentifier: '07700900123' })).toBeUndefined();
  });
});

describe('driverNamesById', () => {
  it('maps each driver id to their display name, skipping links with no driver yet', () => {
    const names = driverNamesById([
      { driverId: 'd1', label: 'Dave', driverIdentifier: 'a' },
      { driverId: 'd2', driverIdentifier: 'b' },
      { invitedIdentifier: 'c' },
    ]);
    expect([...names]).toEqual([
      ['d1', 'Dave'],
      ['d2', 'b'],
    ]);
  });
});
