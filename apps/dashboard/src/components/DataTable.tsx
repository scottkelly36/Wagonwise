import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { filterRows, nextSort, paginate, sortRows, type SortState } from '../lib/table';

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly cell: (row: T) => ReactNode;
  /** Present means the header can be clicked to sort by it. */
  readonly sortValue?: (row: T) => string | number | null | undefined;
  /** Right-align numbers and actions. */
  readonly align?: 'left' | 'right';
}

interface Props<T> {
  readonly columns: readonly Column<T>[];
  readonly rows: readonly T[];
  readonly rowKey: (row: T) => string;
  /** The text a search matches against. Leave out for a list too short to need a search box. */
  readonly searchText?: ((row: T) => string) | undefined;
  readonly emptyText: string;
  /** Rows per page; paging only appears when there are more rows than this. */
  readonly pageSize?: number;
  /** Where the list stops growing and scrolls inside the card, with its header kept in view. */
  readonly maxHeight?: number | string;
  /** Anything to sit on the left of the search box, such as a filter. */
  readonly toolbar?: ReactNode;
}

const DEFAULT_PAGE_SIZE = 25;

/**
 * The dashboard's list: a card with sortable column headers that stay put while the rows scroll,
 * an optional search box, and paging once a list is long. It works on rows already in the browser, so
 * nothing here talks to the server. Pages decide what each cell shows; this decides how a list behaves.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  searchText,
  emptyText,
  pageSize = DEFAULT_PAGE_SIZE,
  maxHeight = '65vh',
  toolbar,
}: Props<T>) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState | undefined>(undefined);
  const [requestedPage, setRequestedPage] = useState(1);
  const scroller = useRef<HTMLDivElement>(null);

  const sortColumn = columns.find((c) => c.key === sort?.columnKey);
  const visible = useMemo(() => {
    const found = searchText === undefined ? [...rows] : filterRows(rows, query, searchText);
    return sortRows(found, sort, sortColumn?.sortValue);
  }, [rows, query, searchText, sort, sortColumn]);

  const { rows: pageRows, page, pageCount } = paginate(visible, requestedPage, pageSize);
  const sortable = columns.filter(
    (column) => column.sortValue !== undefined && column.header !== '',
  );

  // A new search, sort or page starts at the top, so the first result is never scrolled out of sight.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [query, sort, page]);

  return (
    <div className="card data-table-card">
      {(searchText !== undefined || toolbar !== undefined || sortable.length > 0) && (
        <div className="data-table-toolbar">
          <div>{toolbar}</div>
          {/* Headers are not tappable once rows become cards on a phone, so sorting moves here. */}
          {sortable.length > 0 && (
            <label className="data-table-sort-mobile">
              Sort
              <select
                value={sort === undefined ? '' : `${sort.columnKey}:${sort.direction}`}
                onChange={(e) => {
                  const [columnKey, direction] = e.target.value.split(':');
                  setSort(
                    columnKey === undefined || columnKey === ''
                      ? undefined
                      : { columnKey, direction: direction === 'desc' ? 'desc' : 'asc' },
                  );
                  setRequestedPage(1);
                }}
              >
                <option value="">Default order</option>
                {sortable.flatMap((column) => [
                  <option key={`${column.key}:asc`} value={`${column.key}:asc`}>
                    {column.header} (A to Z)
                  </option>,
                  <option key={`${column.key}:desc`} value={`${column.key}:desc`}>
                    {column.header} (Z to A)
                  </option>,
                ])}
              </select>
            </label>
          )}
          {searchText !== undefined && (
            <label className="data-table-search">
              Search
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setRequestedPage(1);
                }}
              />
            </label>
          )}
        </div>
      )}

      <div ref={scroller} className="data-table-scroll" style={{ maxHeight }}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column) => {
                const sorted = sort?.columnKey === column.key ? sort.direction : undefined;
                return (
                  <th
                    key={column.key}
                    style={{ textAlign: column.align ?? 'left' }}
                    aria-sort={
                      sorted === undefined
                        ? undefined
                        : sorted === 'asc'
                          ? 'ascending'
                          : 'descending'
                    }
                  >
                    {column.sortValue === undefined ? (
                      column.header
                    ) : (
                      <button
                        type="button"
                        className="sort-button"
                        onClick={() => setSort(nextSort(sort, column.key))}
                      >
                        {column.header}
                        <span aria-hidden="true" className={sorted ? 'sort-on' : 'sort-off'}>
                          {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
                        </span>
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-label={column.header}
                    style={{ textAlign: column.align ?? 'left' }}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && (
          <p className="data-table-empty">
            {rows.length === 0 ? emptyText : 'Nothing matches that search.'}
          </p>
        )}
      </div>

      {pageCount > 1 && (
        <nav className="data-table-pages" aria-label="Pages">
          <span className="muted">
            {visible.length} {visible.length === 1 ? 'row' : 'rows'}
          </span>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setRequestedPage(page - 1)}
            className="page-button"
          >
            Previous
          </button>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRequestedPage(n)}
              className={n === page ? 'page-button page-current' : 'page-button'}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            disabled={page === pageCount}
            onClick={() => setRequestedPage(page + 1)}
            className="page-button"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

/** A round icon button for a row, like the pencil and bin in a user list. The label is read by
 *  screen readers and shown on hover, so the icon never has to be guessed. */
export function IconButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: 'edit' | 'delete';
  label: string;
  onClick: () => void;
  disabled?: boolean | undefined;
  danger?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      className={danger === true ? 'icon-button icon-danger' : 'icon-button'}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      {icon === 'edit' ? (
        <svg {...iconProps}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      ) : (
        <svg {...iconProps}>
          <path d="M3 6h18" />
          <path d="M8 6V4h8v2" />
          <path d="M19 6l-1 14H6L5 6" />
        </svg>
      )}
    </button>
  );
}
