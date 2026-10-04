import { describe, expect, it } from 'vitest';

import { filterRows, nextSort, paginate, sortRows } from './table';

interface Row {
  readonly name: string;
  readonly miles: number | null;
}

const rows: Row[] = [
  { name: 'job 10', miles: 5 },
  { name: 'Job 2', miles: null },
  { name: 'job 1', miles: 20 },
];

describe('sortRows', () => {
  it('leaves the natural order with no sort', () => {
    expect(sortRows(rows, undefined, (r) => r.name)).toEqual(rows);
  });

  it('compares text ignoring case, with numbers in numeric order', () => {
    const sorted = sortRows(rows, { columnKey: 'name', direction: 'asc' }, (r) => r.name);
    expect(sorted.map((r) => r.name)).toEqual(['job 1', 'Job 2', 'job 10']);
  });

  it('reverses for descending', () => {
    const sorted = sortRows(rows, { columnKey: 'name', direction: 'desc' }, (r) => r.name);
    expect(sorted.map((r) => r.name)).toEqual(['job 10', 'Job 2', 'job 1']);
  });

  it('keeps blank values last in both directions', () => {
    const asc = sortRows(rows, { columnKey: 'miles', direction: 'asc' }, (r) => r.miles);
    const desc = sortRows(rows, { columnKey: 'miles', direction: 'desc' }, (r) => r.miles);
    expect(asc.map((r) => r.miles)).toEqual([5, 20, null]);
    expect(desc.map((r) => r.miles)).toEqual([20, 5, null]);
  });

  it('does not change the rows it was given', () => {
    const copy = [...rows];
    sortRows(rows, { columnKey: 'name', direction: 'asc' }, (r) => r.name);
    expect(rows).toEqual(copy);
  });

  it('keeps equal rows in their original order', () => {
    const tied = [
      { name: 'a', miles: 1 },
      { name: 'b', miles: 1 },
    ];
    expect(sortRows(tied, { columnKey: 'm', direction: 'desc' }, (r) => r.miles)).toEqual(tied);
  });
});

describe('filterRows', () => {
  const text = (r: Row) => r.name;

  it('returns everything for an empty search', () => {
    expect(filterRows(rows, '  ', text)).toHaveLength(3);
  });

  it('matches any case', () => {
    expect(filterRows(rows, 'JOB 2', text).map((r) => r.name)).toEqual(['Job 2']);
  });

  it('needs every word, in any order', () => {
    const people = [{ t: 'Doris Greene Writer' }, { t: 'Jessie Williams Administrator' }];
    const hit = filterRows(people, 'writer doris', (p) => p.t);
    expect(hit).toEqual([people[0]]);
    expect(filterRows(people, 'doris administrator', (p) => p.t)).toEqual([]);
  });
});

describe('paginate', () => {
  const items = Array.from({ length: 53 }, (_, i) => i + 1);

  it('slices a page and counts pages', () => {
    const page = paginate(items, 2, 25);
    expect(page.rows[0]).toBe(26);
    expect(page.rows).toHaveLength(25);
    expect(page.pageCount).toBe(3);
  });

  it('shows a short last page', () => {
    expect(paginate(items, 3, 25).rows).toEqual([51, 52, 53]);
  });

  it('keeps the page in range, for example after a search shrinks the list', () => {
    expect(paginate(items, 9, 25).page).toBe(3);
    expect(paginate(items, 0, 25).page).toBe(1);
  });

  it('is one empty page for no rows', () => {
    expect(paginate([], 1, 25)).toEqual({ rows: [], page: 1, pageCount: 1 });
  });
});

describe('nextSort', () => {
  it('cycles ascending, descending, then off', () => {
    const first = nextSort(undefined, 'name');
    expect(first).toEqual({ columnKey: 'name', direction: 'asc' });
    const second = nextSort(first, 'name');
    expect(second).toEqual({ columnKey: 'name', direction: 'desc' });
    expect(nextSort(second, 'name')).toBeUndefined();
  });

  it('starts ascending on a different column', () => {
    expect(nextSort({ columnKey: 'name', direction: 'desc' }, 'email')).toEqual({
      columnKey: 'email',
      direction: 'asc',
    });
  });
});
