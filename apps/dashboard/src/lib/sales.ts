import type {
  ContactHow,
  ContactResult,
  EntryDto,
  ImportRow,
  LegalForm,
  Pitch,
  ProspectDto,
  SalesStage,
} from '@wagonwise/contracts/sales';

import { parseCsv } from './maintenance-import';

export const STAGE_LABELS: Record<SalesStage, string> = {
  not_contacted: 'Not contacted',
  contacted: 'Contacted',
  replied: 'Replied',
  conversation: 'Conversation',
  demo: 'Demo',
  pilot: 'Pilot',
  paying: 'Paying',
  not_interested: 'Not interested',
  do_not_contact: 'Do not contact',
};

export const HOW_LABELS: Record<ContactHow, string> = {
  phone: 'Phone',
  email: 'Email',
  facebook: 'Facebook',
  in_person: 'In person',
  other: 'Other',
};

export const RESULT_LABELS: Record<ContactResult, string> = {
  sent: 'Reached out, no reply yet',
  replied: 'They replied',
  conversation: 'Had a conversation',
  demo: 'Showed a demo',
  pilot: 'Started a pilot',
  not_interested: 'Not interested',
  opted_out: 'Asked not to be contacted',
};

export const PITCH_LABELS: Record<Pitch, string> = {
  checks: 'Walk-round checks',
  maintenance: 'Maintenance dates',
  proof_of_delivery: 'Proof of delivery',
  fuel_costs: 'Fuel and costs',
  jobs: 'Jobs and dispatch',
  routes_parking: 'Routes and parking',
  other: 'Something else',
};

export const LEGAL_FORM_LABELS: Record<LegalForm, string> = {
  limited: 'Limited company',
  sole_trader_or_partnership: 'Sole trader or partnership',
  unknown: 'Not checked yet',
};

/** About how many lorries make a firm too big to approach before the product is finished (unless someone introduces it). */
export const BIG_FLEET = 100;

/** Firms in these stages are out of the pipeline: nothing to chase. */
const FINISHED: readonly SalesStage[] = ['not_interested', 'do_not_contact', 'paying'];
export const isActive = (stage: SalesStage): boolean => !FINISHED.includes(stage);

/** The rule for how to approach this firm, in a sentence. The page shows it so the rules are read, not remembered. */
export function contactHint(p: ProspectDto): string {
  if (p.stage === 'do_not_contact') return 'Asked not to be contacted. Do not contact them again.';
  if (p.fleetSize !== undefined && p.fleetSize >= BIG_FLEET) {
    return 'A big fleet (about 100 or more lorries): wait until the product is finished, unless someone you know introduces you.';
  }
  if (p.legalForm === 'limited') {
    return 'Limited company: you may email its company mailbox. Say who you are and give a way to opt out.';
  }
  if (p.legalForm === 'sole_trader_or_partnership') {
    return 'Sole trader or partnership: phone only. Do not cold email.';
  }
  return 'Check Companies House first. If it is not a limited company, phone only.';
}

/** The Monday, 00:00 local time, of the week `now` falls in. */
export function weekStart(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** `YYYY-MM-DD` in local time, the form the next-step date is held in. */
export function localDateString(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export interface WeeklyCounts {
  /** Firms first reached this week. */
  readonly contacted: number;
  readonly replied: number;
  readonly conversations: number;
  readonly demos: number;
  /** Pilots started this calendar month (the target is a month, not a week). */
  readonly pilotsThisMonth: number;
}

/** What the weekly brief's targets are measured against. */
export const TARGETS = {
  contacted: { goal: 10, text: '10' },
  replied: { goal: 2, text: '2 to 3' },
  conversations: { goal: 2, text: '2' },
  demos: { goal: 1, text: '1 to 2' },
  pilotsThisMonth: { goal: 1, text: '1' },
} as const;

/** This week's numbers from the log. Each counts firms, not entries: two calls to one firm are one firm. */
export function weeklyCounts(entries: readonly EntryDto[], now: Date): WeeklyCounts {
  const from = weekStart(now).getTime();
  const to = addDays(weekStart(now), 7).getTime();
  const inWeek = (e: EntryDto): boolean => {
    const at = new Date(e.at).getTime();
    return at >= from && at < to;
  };
  const firms = (rows: EntryDto[]): number => new Set(rows.map((e) => e.prospectId)).size;
  const firstEntry = new Map<string, number>();
  for (const e of entries) {
    const at = new Date(e.at).getTime();
    const seen = firstEntry.get(e.prospectId);
    if (seen === undefined || at < seen) firstEntry.set(e.prospectId, at);
  }
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthTo = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  return {
    contacted: [...firstEntry.values()].filter((at) => at >= from && at < to).length,
    replied: firms(entries.filter((e) => e.result === 'replied' && inWeek(e))),
    conversations: firms(entries.filter((e) => e.result === 'conversation' && inWeek(e))),
    demos: firms(entries.filter((e) => e.result === 'demo' && inWeek(e))),
    pilotsThisMonth: firms(
      entries.filter((e) => {
        const at = new Date(e.at).getTime();
        return e.result === 'pilot' && at >= monthFrom && at < monthTo;
      }),
    ),
  };
}

export interface DueItem {
  readonly prospect: ProspectDto;
  readonly reason: string;
}

/** Days after the first message before one follow-up is due. */
export const FOLLOW_UP_AFTER_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * What to do today. A firm whose next-step date has come (or passed) comes first; then a firm reached once and not heard
 * from after seven days, which is due its one follow-up. A firm followed up already is left alone: one reminder, then stop.
 * Firms that said no, asked not to be contacted, or are paying never appear.
 */
export function dueToday(
  prospects: readonly ProspectDto[],
  entries: readonly EntryDto[],
  now: Date,
): DueItem[] {
  const today = localDateString(now);
  const byFirm = new Map<string, EntryDto[]>();
  for (const e of entries) byFirm.set(e.prospectId, [...(byFirm.get(e.prospectId) ?? []), e]);
  const items: DueItem[] = [];
  for (const p of prospects) {
    if (!isActive(p.stage)) continue;
    if (p.nextStepOn !== undefined && p.nextStepOn <= today) {
      const when = p.nextStepOn === today ? 'today' : `since ${formatDate(p.nextStepOn)}`;
      items.push({ prospect: p, reason: `${p.nextStep ?? 'Next step'} (due ${when})` });
      continue;
    }
    if (p.stage !== 'contacted') continue;
    const sent = (byFirm.get(p.id) ?? []).filter((e) => e.result === 'sent');
    const last = sent.map((e) => new Date(e.at).getTime()).sort((a, b) => b - a)[0];
    if (sent.length === 1 && last !== undefined) {
      const days = Math.floor((now.getTime() - last) / MS_PER_DAY);
      if (days >= FOLLOW_UP_AFTER_DAYS) {
        items.push({ prospect: p, reason: `No reply after ${days} days: one follow-up is due` });
      }
    }
  }
  return items;
}

/** `2026-11-09` as `9 Nov`. */
export function formatDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  if (y === undefined || m === undefined || d === undefined) return day;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export interface PitchRow {
  readonly pitch: Pitch;
  /** Firms an entry with this pitch was logged against. */
  readonly firms: number;
  /** Of those, firms that have replied or gone further (at any time). */
  readonly replied: number;
}

const REPLIED_OR_BETTER: readonly ContactResult[] = ['replied', 'conversation', 'demo', 'pilot'];

/** Which pitch gets answers: for each one, how many firms it was used on and how many of them replied. Most used first. */
export function pitchSummary(entries: readonly EntryDto[]): PitchRow[] {
  const repliedFirms = new Set(
    entries.filter((e) => REPLIED_OR_BETTER.includes(e.result)).map((e) => e.prospectId),
  );
  const byPitch = new Map<Pitch, Set<string>>();
  for (const e of entries) {
    if (e.pitch === undefined) continue;
    const set = byPitch.get(e.pitch) ?? new Set<string>();
    set.add(e.prospectId);
    byPitch.set(e.pitch, set);
  }
  return [...byPitch.entries()]
    .map(([pitch, firms]) => ({
      pitch,
      firms: firms.size,
      replied: [...firms].filter((id) => repliedFirms.has(id)).length,
    }))
    .sort((a, b) => b.firms - a.firms || a.pitch.localeCompare(b.pitch));
}

const HEADERS: Record<keyof ImportRow, readonly string[]> = {
  name: ['name', 'firm', 'company', 'company name'],
  town: ['town', 'place', 'location'],
  fleetSize: ['fleet size', 'fleet', 'hgvs', 'vehicles', 'approx. hgvs (used)', 'approx hgvs'],
  haulageType: ['type of haulage', 'haulage type', 'type'],
  website: ['website', 'web'],
  phone: ['phone', 'telephone', 'tel'],
  email: ['email', 'email address', 'mailbox'],
  contactPerson: ['contact person', 'contact name', 'decision-maker', 'estimated decision-maker'],
  legalForm: ['legal form', 'business type', 'limited company'],
  relationship: ['relationship', 'warm or new'],
  nextStep: ['next step'],
  notes: ['notes', 'why your app could be useful to them'],
};

const EMAIL = /[^\s;,]+@[^\s;,]+\.[a-z]{2,}/i;

/** A sheet's "contact details" cell holds a phone, a mailbox, or both: split it, and keep a cell with neither out of the phone. */
function splitContact(cell: string): { phone?: string; email?: string } {
  const email = EMAIL.exec(cell)?.[0];
  const rest = cell
    .replace(EMAIL, '')
    .replace(/^[\s;,]+|[\s;,]+$/g, '')
    .trim();
  const digits = rest.replace(/\D/g, '').length;
  return {
    ...(email === undefined ? {} : { email }),
    ...(digits >= 9 ? { phone: rest } : {}),
  };
}

export interface ParsedFirms {
  readonly rows: ImportRow[];
  /** Why the file could not be used at all. */
  readonly problem: string | undefined;
}

/**
 * Reads a spreadsheet saved as CSV, with a header row. Columns are found by their heading (see `HEADERS`), in any order; only
 * a name column is needed. A "contact details (public)" column is split into a phone and a mailbox.
 */
export function readFirmsCsv(text: string): ParsedFirms {
  const [header, ...body] = parseCsv(text);
  if (header === undefined) return { rows: [], problem: 'The file is empty.' };
  const lower = header.map((h) => h.trim().toLowerCase());
  const find = (key: keyof ImportRow): number => lower.findIndex((h) => HEADERS[key].includes(h));
  const columns = Object.fromEntries(
    (Object.keys(HEADERS) as (keyof ImportRow)[]).map((key) => [key, find(key)]),
  ) as Record<keyof ImportRow, number>;
  const contactColumn = lower.indexOf('contact details (public)');
  if (columns.name < 0) {
    return { rows: [], problem: 'No "Name" column was found. Add a heading called Name.' };
  }
  const rows: ImportRow[] = [];
  for (const line of body) {
    const cell = (key: keyof ImportRow): string | undefined => {
      const i = columns[key];
      const value = i < 0 ? undefined : (line[i] ?? '').trim();
      return value === undefined || value === '' ? undefined : value;
    };
    const name = cell('name');
    if (name === undefined) continue;
    const contact = contactColumn < 0 ? {} : splitContact((line[contactColumn] ?? '').trim());
    const row: ImportRow = { name };
    for (const key of Object.keys(HEADERS) as (keyof ImportRow)[]) {
      const value = cell(key);
      if (key !== 'name' && value !== undefined) (row as Record<string, string>)[key] = value;
    }
    if (row.phone === undefined && contact.phone !== undefined) row.phone = contact.phone;
    if (row.email === undefined && contact.email !== undefined) row.email = contact.email;
    rows.push(row);
  }
  if (rows.length === 0) return { rows, problem: 'No firms were found under the headings.' };
  return { rows, problem: undefined };
}
