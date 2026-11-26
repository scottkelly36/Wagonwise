import { describe, expect, it } from 'vitest';
import {
  downloadStatus,
  sendMyTachographFileRequestSchema,
  uploadTachographFileRequestSchema,
} from './tachograph.js';

describe('downloadStatus', () => {
  it('says there is no file when none has been received', () => {
    expect(downloadStatus('driver_card', undefined, '2026-11-26')).toEqual({ state: 'no_file' });
  });

  it('counts 28 days for a driver card and 90 for a vehicle unit', () => {
    expect(downloadStatus('driver_card', '2026-11-26', '2026-11-26')).toEqual({
      state: 'ok',
      dueOn: '2026-12-24',
      daysLeft: 28,
    });
    expect(downloadStatus('vehicle_unit', '2026-11-26', '2026-11-26')).toEqual({
      state: 'ok',
      dueOn: '2027-02-24',
      daysLeft: 90,
    });
  });

  it('is due soon for the last 7 days, and due on the day itself', () => {
    expect(downloadStatus('driver_card', '2026-11-01', '2026-11-21').state).toBe('ok');
    expect(downloadStatus('driver_card', '2026-11-01', '2026-11-22').state).toBe('due_soon');
    expect(downloadStatus('driver_card', '2026-11-01', '2026-11-29')).toEqual({
      state: 'due_soon',
      dueOn: '2026-11-29',
      daysLeft: 0,
    });
  });

  it('is overdue from the day after, with the days past as a negative number', () => {
    expect(downloadStatus('driver_card', '2026-11-01', '2026-11-30')).toEqual({
      state: 'overdue',
      dueOn: '2026-11-29',
      daysLeft: -1,
    });
  });

  it('does not wobble across the clocks changing', () => {
    expect(downloadStatus('driver_card', '2026-10-20', '2026-11-17').daysLeft).toBe(0);
  });
});

describe('upload requests', () => {
  const base = { fileName: 'C_20261126.DDD', downloadedOn: '2026-11-26', dataBase64: 'AAEC' };

  it('wants a driver for a card file and a vehicle for a unit file, never both', () => {
    const ok = (v: object) =>
      uploadTachographFileRequestSchema.safeParse({ ...base, ...v }).success;
    expect(ok({ kind: 'driver_card', driverId: 'd1' })).toBe(true);
    expect(ok({ kind: 'vehicle_unit', vehicleId: 'v1' })).toBe(true);
    expect(ok({ kind: 'driver_card' })).toBe(false);
    expect(ok({ kind: 'driver_card', driverId: 'd1', vehicleId: 'v1' })).toBe(false);
    expect(ok({ kind: 'vehicle_unit', driverId: 'd1' })).toBe(false);
  });

  it('refuses a bad date, an empty file and a name that is blank', () => {
    const bad = (v: object) =>
      sendMyTachographFileRequestSchema.safeParse({ ...base, ...v }).success;
    expect(bad({})).toBe(true);
    expect(bad({ downloadedOn: '26/11/2026' })).toBe(false);
    expect(bad({ dataBase64: '' })).toBe(false);
    expect(bad({ fileName: '   ' })).toBe(false);
  });
});
