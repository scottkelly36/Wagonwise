import { describe, expect, it } from 'vitest';
import { GUIDE, guideIdForPath, guideSection, searchGuide } from './guide';

describe('the guide', () => {
  it('has unique ids and something to say in every section', () => {
    expect(new Set(GUIDE.map((s) => s.id)).size).toBe(GUIDE.length);
    for (const section of GUIDE) {
      expect(section.about.length).toBeGreaterThan(0);
      expect(section.steps.length).toBeGreaterThan(0);
    }
  });
});

describe('guideIdForPath', () => {
  it('points every mapped page at a section that exists', () => {
    const pages = [
      '/',
      '/fleet',
      '/fleet/jobs',
      '/fleet/live-trips',
      '/fleet/drivers',
      '/fleet/places',
      '/fleet/fuel',
      '/fleet/costs',
      '/fleet/job-costs',
      '/fleet/outlook',
      '/fleet/checks',
      '/fleet/check-results',
      '/fleet/defects',
      '/fleet/maintenance',
      '/fleet/vehicle-profiles',
      '/fleet/reports',
      '/staff/users',
      '/staff/activity',
      '/staff/plan',
      '/staff/settings',
    ];
    for (const page of pages) expect(guideSection(guideIdForPath(page))).toBeDefined();
  });

  it('copes with a trailing slash and a page beneath a link, and has none for other pages', () => {
    expect(guideIdForPath('/fleet/jobs/')).toBe('jobs');
    expect(guideIdForPath('/fleet/jobs/123')).toBe('jobs');
    expect(guideIdForPath('/fleet/jobsite')).toBeUndefined();
    expect(guideIdForPath('/admin/companies')).toBeUndefined();
    expect(guideIdForPath('/guide')).toBeUndefined();
  });
});

describe('searchGuide', () => {
  it('returns everything for no words, and needs every word to match', () => {
    expect(searchGuide('  ')).toHaveLength(GUIDE.length);
    expect(searchGuide('fuel statement').map((s) => s.id)).toContain('fuel');
    expect(searchGuide('fuel zzzzqqq')).toHaveLength(0);
  });
});
