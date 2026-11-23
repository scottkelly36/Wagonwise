import { PORTAL_FORMS, PORTAL_PAGES, PORTAL_PROBLEMS } from '@wagonwise/contracts/usage';
import { describe, expect, it } from 'vitest';
import {
  FORM_LABELS,
  PAGE_LABELS,
  PROBLEM_LABELS,
  fieldLabel,
  secondsText,
  sentText,
  stoppedAt,
} from './portal-usage';

describe('labels', () => {
  it('has a name for every page, form and problem the server accepts', () => {
    for (const page of PORTAL_PAGES) expect(PAGE_LABELS[page]).toBeTruthy();
    for (const form of PORTAL_FORMS) expect(FORM_LABELS[form]).toBeTruthy();
    for (const problem of PORTAL_PROBLEMS) expect(PROBLEM_LABELS[problem]).toBeTruthy();
  });

  it('names a field, and falls back to the field itself', () => {
    expect(fieldLabel('top_speed')).toBe('Top speed');
    expect(fieldLabel('something_new')).toBe('something_new');
  });
});

describe('stoppedAt', () => {
  it('says the first thing a firm has not done, in the order a firm sets up', () => {
    expect(stoppedAt({ vehicles: 0, drivers: 0, jobs: 0 })).toBe('Nothing set up yet');
    expect(stoppedAt({ vehicles: 0, drivers: 2, jobs: 0 })).toBe('No vehicle yet');
    expect(stoppedAt({ vehicles: 1, drivers: 0, jobs: 0 })).toBe('No driver yet');
    expect(stoppedAt({ vehicles: 1, drivers: 1, jobs: 0 })).toBe(
      'Vehicle and driver set up, no job yet',
    );
    expect(stoppedAt({ vehicles: 1, drivers: 1, jobs: 3 })).toBe('Has a job');
  });
});

describe('sentText and secondsText', () => {
  it('writes how many forms were sent, and a dash when none was opened', () => {
    expect(sentText(4, 3)).toBe('3 of 4 (75%)');
    expect(sentText(0, 0)).toBe('–');
  });

  it('writes a time plainly', () => {
    expect(secondsText(null)).toBe('–');
    expect(secondsText(45)).toBe('45 s');
    expect(secondsText(90)).toBe('1 min 30 s');
    expect(secondsText(120)).toBe('2 min');
  });
});
