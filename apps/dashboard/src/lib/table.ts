export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly columnKey: string;
  readonly direction: SortDirection;
}

type SortValue = string | number | null | undefined;

/** Case-insensitive, and digits compare as numbers ("Job 2" before "Job 10"). Empty values go last
 *  in either direction, so a blank never hides the rows that have something. */
function compareValues(a: SortValue, b: SortValue): number {
  const aBlank = a === null || a === undefined || a === '';
  const bBlank = b === null || b === undefined || b === '';
  if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en-GB', { numeric: true, sensitivity: 'base' });
}

export function sortRows<T>(
  rows: readonly T[],
  sort: SortState | undefined,
  sortValueOf: ((row: T) => SortValue) | undefined,
): T[] {
  if (sort === undefined || sortValueOf === undefined) return [...rows];
  const sign = sort.direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: sortValueOf(row) }))
    .sort((a, b) => {
      const blankA = a.value === null || a.value === undefined || a.value === '';
      const blankB = b.value === null || b.value === undefined || b.value === '';
      // Blanks stay last whichever way it is sorted, so they are kept out of the sign flip.
      const order =
        blankA || blankB ? compareValues(a.value, b.value) : sign * compareValues(a.value, b.value);
      return order !== 0 ? order : a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** Every word typed must appear somewhere in the row's searchable text, in any order. */
export function filterRows<T>(
  rows: readonly T[],
  query: string,
  searchTextOf: (row: T) => string,
): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...rows];
  return rows.filter((row) => {
    const text = searchTextOf(row).toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export interface Page<T> {
  readonly rows: T[];
  /** The page actually shown, 1-based, kept inside the range even if rows were removed meanwhile. */
  readonly page: number;
  readonly pageCount: number;
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const from = (safePage - 1) * pageSize;
  return { rows: rows.slice(from, from + pageSize), page: safePage, pageCount };
}

/**
 * The page buttons to show: a few near the current page, with the first and last always there and a gap marker between, so 187
 * pages is "1 2 3 4 5 … 187" at the start, "1 … 92 93 94 … 187" in the middle and "1 … 183 184 185 186 187" at the end. Up to
 * seven pages are all shown.
 */
export type PageButton = number | 'gap';

export function pageButtons(page: number, pageCount: number): PageButton[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const range = (from: number, to: number): number[] =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i);
  if (page <= 4) return [...range(1, 5), 'gap', pageCount];
  if (page >= pageCount - 3) return [1, 'gap', ...range(pageCount - 4, pageCount)];
  return [1, 'gap', page - 1, page, page + 1, 'gap', pageCount];
}

/** What a header click does to the current sort: first click ascending, second descending, third
 *  back to the natural order. */
export function nextSort(current: SortState | undefined, columnKey: string): SortState | undefined {
  if (current?.columnKey !== columnKey) return { columnKey, direction: 'asc' };
  if (current.direction === 'asc') return { columnKey, direction: 'desc' };
  return undefined;
}
