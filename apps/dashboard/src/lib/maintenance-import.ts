export interface ImportRow {
  readonly registration: string;
  readonly itemName: string;
  /** `YYYY-MM-DD`, or the text as typed when it could not be read (the server reports that row). */
  readonly dueDate: string;
}

export interface ParsedImport {
  readonly rows: ImportRow[];
  /** Why the file could not be used at all. */
  readonly problem: string | undefined;
}

/** Splits CSV text into rows of cells: quoted cells, doubled quotes and commas inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    if (quoted) {
      if (ch === '"' && body.charAt(i + 1) === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body.charAt(i + 1) === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * A date as a spreadsheet gives it: `2027-01-31` or the UK `31/01/2027` (also `31-01-2027`, `31.01.2027`, a two-digit
 * year meaning 20xx). Anything else is returned as typed so the server can report the row.
 */
export function readDate(raw: string): string {
  const text = raw.trim();
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  if (uk === null) return text;
  const [, d = '', m = '', y = ''] = uk;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

const REGISTRATION = ['registration', 'reg', 'reg no', 'reg number', 'vehicle', 'number plate'];
const ITEM = ['item', 'what', 'type', 'check'];
const DUE = ['due', 'due date', 'date', 'next due'];

const at = (header: string[], names: string[]): number =>
  header.findIndex((h) => names.includes(h.trim().toLowerCase()));

/**
 * Reads a spreadsheet of dates. Two layouts are understood, both with a header row:
 * - one column per thing (`Registration, MOT, Tail lift`), a vehicle per row; or
 * - one row per date (`Registration, Item, Due date`).
 * Empty cells are left alone.
 */
export function readImport(text: string): ParsedImport {
  const table = parseCsv(text);
  const header = table[0];
  if (header === undefined) return { rows: [], problem: 'The file is empty.' };
  const reg = at(header, REGISTRATION);
  if (reg === -1) {
    return { rows: [], problem: 'The first row needs a “Registration” column.' };
  }
  const item = at(header, ITEM);
  const due = at(header, DUE);
  const rows: ImportRow[] = [];

  if (item !== -1 && due !== -1) {
    for (const cells of table.slice(1)) {
      const dueDate = (cells[due] ?? '').trim();
      if (dueDate === '') continue;
      rows.push({
        registration: (cells[reg] ?? '').trim(),
        itemName: (cells[item] ?? '').trim(),
        dueDate: readDate(dueDate),
      });
    }
  } else {
    if (header.length < 2) {
      return { rows: [], problem: 'Add a column for each thing you track, such as MOT.' };
    }
    for (const cells of table.slice(1)) {
      header.forEach((name, column) => {
        const dueDate = (cells[column] ?? '').trim();
        if (column === reg || name.trim() === '' || dueDate === '') return;
        rows.push({
          registration: (cells[reg] ?? '').trim(),
          itemName: name.trim(),
          dueDate: readDate(dueDate),
        });
      });
    }
  }
  return {
    rows,
    problem: rows.length === 0 ? 'The file has no dates in it.' : undefined,
  };
}
