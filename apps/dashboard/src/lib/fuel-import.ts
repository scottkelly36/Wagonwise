import type { FuelRowDto } from '@wagonwise/contracts/costing';
import { parseCsv } from './maintenance-import';

/** Which column of the statement holds what. A column is named by its heading, so the choice survives a new file. */
export interface FuelMapping {
  readonly date: string;
  /** Left out when the date column already has the time, or the statement has none. */
  readonly time: string | undefined;
  readonly registration: string;
  readonly amount: string;
  readonly litres: string | undefined;
  readonly description: string | undefined;
}

const GUESSES: Record<keyof FuelMapping, string[]> = {
  date: [
    'date',
    'transaction date',
    'purchase date',
    'trans date',
    'date of transaction',
    'tran date',
  ],
  time: ['time', 'transaction time', 'purchase time'],
  registration: [
    'registration',
    'reg',
    'vehicle reg',
    'vehicle registration',
    'vrm',
    'reg no',
    'reg number',
    'vehicle',
    'number plate',
  ],
  amount: [
    'gross',
    'gross amount',
    'amount',
    'total',
    'total cost',
    'value',
    'cost',
    'net',
    'net amount',
    'transaction value',
  ],
  litres: ['litres', 'liters', 'quantity', 'qty', 'volume', 'fuel quantity', 'units'],
  description: [
    'product',
    'fuel type',
    'description',
    'merchant',
    'site',
    'location',
    'station',
    'product description',
  ],
};

/** A first guess at the mapping from the headings, for the person to check and change. */
export function guessMapping(headers: readonly string[]): Partial<FuelMapping> {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const found = (key: keyof FuelMapping): string | undefined => {
    for (const guess of GUESSES[key]) {
      const at = lower.indexOf(guess);
      if (at !== -1) return headers[at];
    }
    return undefined;
  };
  return {
    date: found('date'),
    time: found('time'),
    registration: found('registration'),
    amount: found('amount'),
    litres: found('litres'),
    description: found('description'),
  };
}

/**
 * A date (and time) as a card statement writes it, into an ISO time on the viewer's clock (a UK firm's, in practice):
 * `31/10/2026`, `31/10/2026 14:05`, `2026-10-31`, `2026-10-31 14:05`, with an optional separate time (`14:05` or
 * `14:05:30`). Returns `undefined` when it is not a date. A date with no time is taken as midday, so a purchase never slips
 * into the day before or after across the clocks changing.
 */
export function readDateTime(date: string, time?: string): string | undefined {
  const text = date.trim();
  let y: number;
  let mo: number;
  let d: number;
  let h = 12;
  let mi = 0;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(text);
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(text);
  if (iso !== null) {
    y = Number(iso[1]);
    mo = Number(iso[2]);
    d = Number(iso[3]);
    if (iso[4] !== undefined) {
      h = Number(iso[4]);
      mi = Number(iso[5]);
    }
  } else if (uk !== null) {
    d = Number(uk[1]);
    mo = Number(uk[2]);
    y = Number(uk[3]) < 100 ? 2000 + Number(uk[3]) : Number(uk[3]);
    if (uk[4] !== undefined) {
      h = Number(uk[4]);
      mi = Number(uk[5]);
    }
  } else {
    return undefined;
  }
  const extra = time === undefined ? null : /^(\d{1,2}):(\d{2})/.exec(time.trim());
  if (extra !== null) {
    h = Number(extra[1]);
    mi = Number(extra[2]);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return undefined;
  const when = new Date(y, mo - 1, d, h, mi);
  // Reject 31 February and the like, which Date quietly rolls into March.
  if (when.getMonth() !== mo - 1 || when.getDate() !== d) return undefined;
  return when.toISOString();
}

/** "£1,234.56", "-12.5", "(12.50)" (a bracket is a credit in some statements) as whole pence; `undefined` if not an amount. */
export function readPence(text: string): number | undefined {
  let t = text.trim().replace(/[£\s]/g, '').replace(/,/g, '');
  if (t === '') return undefined;
  let negative = false;
  if (/^\(.*\)$/.test(t)) {
    negative = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith('-')) {
    negative = !negative;
    t = t.slice(1);
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  const pence = Math.round(Number(t) * 100);
  return negative ? -pence : pence;
}

/** Litres as a number; `undefined` when blank or not one. */
export function readLitres(text: string): number | undefined {
  const t = text.trim().replace(/,/g, '');
  if (t === '' || !/^\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
}

export interface ReadFuel {
  readonly rows: FuelRowDto[];
  /** Rows left out, and why, by their line in the file (the header is line 1). */
  readonly skipped: { readonly line: number; readonly why: string }[];
  /** Why the file or the mapping cannot be used at all. */
  readonly problem: string | undefined;
}

/** Reads the statement's rows through the mapping. A row it cannot read is skipped and reported, not guessed at. */
export function readFuel(text: string, mapping: FuelMapping): ReadFuel {
  const table = parseCsv(text);
  const header = table[0];
  if (header === undefined) return { rows: [], skipped: [], problem: 'The file is empty.' };
  const at = (name: string | undefined): number => (name === undefined ? -1 : header.indexOf(name));
  const date = at(mapping.date);
  const reg = at(mapping.registration);
  const amount = at(mapping.amount);
  if (date === -1 || reg === -1 || amount === -1) {
    return {
      rows: [],
      skipped: [],
      problem: 'Choose the columns for the date, the registration and the amount.',
    };
  }
  const time = at(mapping.time);
  const litres = at(mapping.litres);
  const description = at(mapping.description);

  const rows: FuelRowDto[] = [];
  const skipped: { line: number; why: string }[] = [];
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const when = readDateTime(cells[date] ?? '', time === -1 ? undefined : cells[time]);
    if (when === undefined) return void skipped.push({ line, why: 'the date could not be read' });
    const registration = (cells[reg] ?? '').trim();
    if (registration === '') return void skipped.push({ line, why: 'no registration' });
    const pence = readPence(cells[amount] ?? '');
    if (pence === undefined || pence === 0) {
      return void skipped.push({ line, why: 'the amount could not be read' });
    }
    const l = litres === -1 ? undefined : readLitres(cells[litres] ?? '');
    const d = description === -1 ? '' : (cells[description] ?? '').trim();
    rows.push({
      occurredAt: when,
      registration,
      amountPence: pence,
      ...(l === undefined ? {} : { litres: l }),
      ...(d === '' ? {} : { description: d.slice(0, 200) }),
    });
  });
  return {
    rows,
    skipped,
    problem: rows.length === 0 ? 'No purchases could be read with these columns.' : undefined,
  };
}

/** The mapping as saved for a company on this browser, so the second statement is one click. */
const KEY = (companyId: string): string => `wagonwise.fuelMapping.${companyId}`;

export function loadMapping(companyId: string): Partial<FuelMapping> | undefined {
  try {
    const raw = localStorage.getItem(KEY(companyId));
    return raw === null ? undefined : (JSON.parse(raw) as Partial<FuelMapping>);
  } catch {
    return undefined;
  }
}

export function saveMapping(companyId: string, mapping: FuelMapping): void {
  try {
    localStorage.setItem(KEY(companyId), JSON.stringify(mapping));
  } catch {
    // Storage unavailable: the mapping just is not remembered.
  }
}

/** The reasons the server gives for a row it would not take, in words. */
export const INVALID_REASONS = {
  bad_date: 'the date is not valid',
  bad_amount: 'the amount is not valid',
  bad_litres: 'the litres are not valid',
  no_registration: 'no registration',
} as const;
