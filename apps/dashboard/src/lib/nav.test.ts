import { describe, expect, it } from 'vitest';
import { foldingSections, MENU_CAP, SECTION_CAP, sectionForPath, toggled } from './nav';

const group = (title: string, count: number, base = `/${title.toLowerCase()}`) => ({
  title,
  items: Array.from({ length: count }, (_, i) => ({ to: `${base}/${i}` })),
});

describe('foldingSections', () => {
  it('folds only a section longer than the cap while the whole menu is short', () => {
    const groups = [group('Small', SECTION_CAP), group('Long', SECTION_CAP + 1)];
    expect([...foldingSections(groups)]).toEqual(['Long']);
  });

  it('folds every section of two or more once the whole menu is long, but never a single link', () => {
    const groups = [group('A', 4), group('B', 4), group('C', 4), group('D', 1)];
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBeGreaterThan(MENU_CAP);
    expect([...foldingSections(groups)].sort()).toEqual(['A', 'B', 'C']);
  });

  it('folds nothing for a short menu', () => {
    expect([...foldingSections([group('A', 3), group('B', 2)])]).toEqual([]);
  });
});

describe('sectionForPath', () => {
  const groups = [
    { title: 'Operations', items: [{ to: '/fleet/jobs' }, { to: '/fleet/live-trips' }] },
    { title: 'Your team', items: [{ to: '/staff/users' }] },
  ];

  it('finds the section for a page, and for a page beneath a link', () => {
    expect(sectionForPath(groups, '/fleet/jobs')).toBe('Operations');
    expect(sectionForPath(groups, '/fleet/jobs/123')).toBe('Operations');
    expect(sectionForPath(groups, '/staff/users')).toBe('Your team');
  });

  it('does not match a link that merely starts the same', () => {
    expect(sectionForPath(groups, '/fleet/jobsite')).toBeUndefined();
    expect(sectionForPath(groups, '/elsewhere')).toBeUndefined();
  });

  it('prefers the longer link', () => {
    const nested = [
      { title: 'Outer', items: [{ to: '/fleet' }] },
      { title: 'Inner', items: [{ to: '/fleet/jobs' }] },
    ];
    expect(sectionForPath(nested, '/fleet/jobs/1')).toBe('Inner');
  });
});

describe('toggled', () => {
  it('opens one and closes the others, and closes the open one when clicked again', () => {
    expect(toggled(undefined, 'A')).toBe('A');
    expect(toggled('A', 'B')).toBe('B');
    expect(toggled('B', 'B')).toBeUndefined();
  });
});
