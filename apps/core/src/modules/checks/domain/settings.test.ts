import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFECT_RECORD_MONTHS,
  isValidRetention,
  monthsAgo,
  retentionCutoffs,
  startVerdict,
  type CheckSettings,
} from './settings.js';

const on: CheckSettings = { ...DEFAULT_SETTINGS, requiredBeforeJob: true, blockOnDoNotDrive: true };
const verdict = (settings: CheckSettings, listsStillToDo: number, hasUnfixedDoNotDrive: boolean) =>
  startVerdict({ settings, listsStillToDo, hasUnfixedDoNotDrive });

describe('startVerdict', () => {
  it('holds nothing back for a firm that has turned nothing on, whatever the state of the vehicle', () => {
    expect(verdict(DEFAULT_SETTINGS, 3, true)).toBe('ok');
  });

  it('wants the check done first, when asked, and is satisfied once every list is done', () => {
    const required = { ...DEFAULT_SETTINGS, requiredBeforeJob: true };
    expect(verdict(required, 1, false)).toBe('check_required');
    expect(verdict(required, 0, false)).toBe('ok');
  });

  it('does not lock out a firm with no lists for the vehicle', () => {
    expect(verdict({ ...DEFAULT_SETTINGS, requiredBeforeJob: true }, 0, false)).toBe('ok');
  });

  it('holds back a vehicle with a do-not-drive defect open, when asked, even with its check done', () => {
    const block = { ...DEFAULT_SETTINGS, blockOnDoNotDrive: true };
    expect(verdict(block, 0, true)).toBe('vehicle_not_fit');
    expect(verdict(block, 0, false)).toBe('ok');
  });

  it('ignores a defect when the firm has not asked to hold those back', () => {
    expect(verdict({ ...DEFAULT_SETTINGS, requiredBeforeJob: true }, 0, true)).toBe('ok');
  });

  it('puts the unfit vehicle before the missing check, because doing the check does not make it safe', () => {
    expect(verdict(on, 1, true)).toBe('vehicle_not_fit');
    expect(verdict(on, 1, false)).toBe('check_required');
    expect(verdict(on, 0, false)).toBe('ok');
  });
});

describe('retention', () => {
  it('is 12 months until a firm chooses', () => {
    expect(DEFAULT_SETTINGS.retentionMonths).toBe(12);
  });

  it('accepts whole months from 1 to 120 and nothing else', () => {
    for (const ok of [1, 12, 120]) expect(isValidRetention(ok)).toBe(true);
    for (const bad of [0, -1, 121, 1.5, Number.NaN]) expect(isValidRetention(bad)).toBe(false);
  });

  it('keeps a check that found a defect at least 15 months, the legal minimum for defect reports, whatever the firm sets', () => {
    expect(DEFECT_RECORD_MONTHS).toBe(15);
    const now = new Date('2026-10-09T09:00:00.000Z');
    // The default, and a short choice: nothing found goes at the firm's date, a defect check waits for 15 months.
    for (const months of [12, 3, 1]) {
      const cutoffs = retentionCutoffs(now, months);
      expect(cutoffs.clearBefore).toEqual(monthsAgo(now, months));
      expect(cutoffs.withDefectsBefore.toISOString()).toBe('2025-07-09T09:00:00.000Z');
    }
  });

  it('lets a firm that chooses longer than 15 months keep a defect check as long as it chose', () => {
    const now = new Date('2026-10-09T09:00:00.000Z');
    const cutoffs = retentionCutoffs(now, 24);
    expect(cutoffs.clearBefore.toISOString()).toBe('2024-10-09T09:00:00.000Z');
    expect(cutoffs.withDefectsBefore.toISOString()).toBe('2024-10-09T09:00:00.000Z');
    expect(retentionCutoffs(now, 15).withDefectsBefore.toISOString()).toBe(
      '2025-07-09T09:00:00.000Z',
    );
  });

  it('counts back whole calendar months in UTC', () => {
    expect(monthsAgo(new Date('2026-10-09T09:00:00.000Z'), 12).toISOString()).toBe(
      '2025-10-09T09:00:00.000Z',
    );
    expect(monthsAgo(new Date('2026-03-15T00:00:00.000Z'), 3).toISOString()).toBe(
      '2025-12-15T00:00:00.000Z',
    );
  });
});
