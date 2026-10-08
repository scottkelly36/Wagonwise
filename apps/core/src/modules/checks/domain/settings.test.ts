import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, startVerdict, type CheckSettings } from './settings.js';

const on: CheckSettings = { requiredBeforeJob: true, blockOnDoNotDrive: true };
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
