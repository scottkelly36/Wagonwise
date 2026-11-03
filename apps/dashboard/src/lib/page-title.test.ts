import { describe, expect, it } from 'vitest';
import { pageTitle } from './page-title';

const links = [
  { to: '/fleet', label: 'Overview' },
  { to: '/fleet/jobs', label: 'Jobs' },
  { to: '/fleet/costs', label: 'Running costs and pay' },
];

describe('pageTitle', () => {
  it('names the page, then the product', () => {
    expect(pageTitle('/fleet/jobs', links)).toBe('Jobs · WagonWise');
  });

  it('takes the longest matching link, so Overview does not claim every fleet page', () => {
    expect(pageTitle('/fleet', links)).toBe('Overview · WagonWise');
    expect(pageTitle('/fleet/costs', links)).toBe('Running costs and pay · WagonWise');
  });

  it('gives a page beneath a link that link’s name', () => {
    expect(pageTitle('/fleet/jobs/123', links)).toBe('Jobs · WagonWise');
    expect(pageTitle('/guide/jobs', links)).toBe('Guide · WagonWise');
  });

  it('names pages that are not in the menu', () => {
    expect(pageTitle('/fleet/reports', links)).toBe('Reports · WagonWise');
  });

  it('falls back to the product name', () => {
    expect(pageTitle('/somewhere-else', links)).toBe('WagonWise');
  });

  it('does not match a link that only shares a prefix', () => {
    // /fleet/jobsite is beneath /fleet but is not Jobs.
    expect(pageTitle('/fleet/jobsite', links)).toBe('Overview · WagonWise');
  });
});
