import type { Id } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';

export type ProspectId = Id<'ProspectId'>;
export type SalesEntryId = Id<'SalesEntryId'>;

/** The pipeline, in order. A firm moves forward through these and never back by itself. */
export const PIPELINE = [
  'not_contacted',
  'contacted',
  'replied',
  'conversation',
  'demo',
  'pilot',
  'paying',
] as const;
export const STAGES = [...PIPELINE, 'not_interested', 'do_not_contact'] as const;
export type Stage = (typeof STAGES)[number];

export const LEGAL_FORMS = ['limited', 'sole_trader_or_partnership', 'unknown'] as const;
export type LegalForm = (typeof LEGAL_FORMS)[number];
export const RELATIONSHIPS = ['warm', 'new'] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];
export const HOWS = ['phone', 'email', 'facebook', 'in_person', 'other'] as const;
export type How = (typeof HOWS)[number];
export const RESULTS = [
  'sent',
  'replied',
  'conversation',
  'demo',
  'pilot',
  'not_interested',
  'opted_out',
] as const;
export type ContactResult = (typeof RESULTS)[number];
export const PITCHES = [
  'checks',
  'maintenance',
  'proof_of_delivery',
  'fuel_costs',
  'jobs',
  'routes_parking',
  'other',
] as const;
export type Pitch = (typeof PITCHES)[number];

export interface Prospect {
  readonly id: ProspectId;
  readonly name: string;
  readonly town: string | undefined;
  readonly fleetSize: number | undefined;
  readonly haulageType: string | undefined;
  readonly website: string | undefined;
  readonly phone: string | undefined;
  readonly email: string | undefined;
  readonly contactPerson: string | undefined;
  readonly legalForm: LegalForm;
  readonly relationship: Relationship;
  readonly stage: Stage;
  readonly nextStep: string | undefined;
  /** `YYYY-MM-DD`. */
  readonly nextStepOn: string | undefined;
  readonly notes: string | undefined;
  readonly createdAt: Date;
}

export interface SalesEntry {
  readonly id: SalesEntryId;
  readonly prospectId: ProspectId;
  readonly at: Date;
  readonly how: How;
  readonly result: ContactResult;
  readonly pitch: Pitch | undefined;
  readonly note: string | undefined;
  readonly createdAt: Date;
}

export interface InvalidProspect extends TaggedError<'InvalidProspect'> {
  readonly field:
    | 'name'
    | 'town'
    | 'fleet_size'
    | 'haulage_type'
    | 'website'
    | 'phone'
    | 'email'
    | 'contact_person'
    | 'legal_form'
    | 'relationship'
    | 'stage'
    | 'next_step'
    | 'next_step_on'
    | 'notes';
}

export interface InvalidEntry extends TaggedError<'InvalidEntry'> {
  readonly field: 'at' | 'how' | 'result' | 'pitch' | 'note' | 'next_step' | 'next_step_on';
}

/** A cell as typed: surrounding spaces gone, and nothing at all is "not given". */
export const clean = (raw: string | null | undefined): string | undefined => {
  const text = raw?.trim();
  return text === undefined || text === '' ? undefined : text;
};

const isOneOf = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);

/** A real calendar date written `YYYY-MM-DD`. */
export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** The fields of a firm a person can type, before they are checked. `undefined` is "not given". */
export interface ProspectFields {
  readonly name: string;
  readonly town?: string | undefined;
  readonly fleetSize?: number | undefined;
  readonly haulageType?: string | undefined;
  readonly website?: string | undefined;
  readonly phone?: string | undefined;
  readonly email?: string | undefined;
  readonly contactPerson?: string | undefined;
  readonly legalForm?: string | undefined;
  readonly relationship?: string | undefined;
  readonly stage?: string | undefined;
  readonly nextStep?: string | undefined;
  readonly nextStepOn?: string | undefined;
  readonly notes?: string | undefined;
}

const LIMITS = {
  name: 120,
  town: 80,
  haulageType: 200,
  website: 200,
  phone: 60,
  email: 254,
  contactPerson: 80,
  nextStep: 300,
  notes: 2000,
} as const;

/** Checks the fields and fills in the defaults: not contacted, a new contact, legal form unknown. */
export function checkProspect(
  fields: ProspectFields,
): Result<Omit<Prospect, 'id' | 'createdAt'>, InvalidProspect> {
  const name = clean(fields.name);
  if (name === undefined || name.length > LIMITS.name) {
    return err({ tag: 'InvalidProspect', field: 'name' });
  }
  const tooLong = (value: string | undefined, max: number): boolean =>
    value !== undefined && value.length > max;
  const town = clean(fields.town);
  if (tooLong(town, LIMITS.town)) return err({ tag: 'InvalidProspect', field: 'town' });
  const haulageType = clean(fields.haulageType);
  if (tooLong(haulageType, LIMITS.haulageType)) {
    return err({ tag: 'InvalidProspect', field: 'haulage_type' });
  }
  const website = clean(fields.website);
  if (tooLong(website, LIMITS.website)) return err({ tag: 'InvalidProspect', field: 'website' });
  const phone = clean(fields.phone);
  if (tooLong(phone, LIMITS.phone)) return err({ tag: 'InvalidProspect', field: 'phone' });
  const email = clean(fields.email);
  if (tooLong(email, LIMITS.email)) return err({ tag: 'InvalidProspect', field: 'email' });
  const contactPerson = clean(fields.contactPerson);
  if (tooLong(contactPerson, LIMITS.contactPerson)) {
    return err({ tag: 'InvalidProspect', field: 'contact_person' });
  }
  const nextStep = clean(fields.nextStep);
  if (tooLong(nextStep, LIMITS.nextStep)) {
    return err({ tag: 'InvalidProspect', field: 'next_step' });
  }
  const notes = clean(fields.notes);
  if (tooLong(notes, LIMITS.notes)) return err({ tag: 'InvalidProspect', field: 'notes' });
  const fleetSize = fields.fleetSize;
  if (
    fleetSize !== undefined &&
    (!Number.isInteger(fleetSize) || fleetSize < 0 || fleetSize > 10_000)
  ) {
    return err({ tag: 'InvalidProspect', field: 'fleet_size' });
  }
  const legalForm = clean(fields.legalForm) ?? 'unknown';
  if (!isOneOf(LEGAL_FORMS, legalForm)) return err({ tag: 'InvalidProspect', field: 'legal_form' });
  const relationship = clean(fields.relationship) ?? 'new';
  if (!isOneOf(RELATIONSHIPS, relationship)) {
    return err({ tag: 'InvalidProspect', field: 'relationship' });
  }
  const stage = clean(fields.stage) ?? 'not_contacted';
  if (!isOneOf(STAGES, stage)) return err({ tag: 'InvalidProspect', field: 'stage' });
  const nextStepOn = clean(fields.nextStepOn);
  if (nextStepOn !== undefined && !isDateOnly(nextStepOn)) {
    return err({ tag: 'InvalidProspect', field: 'next_step_on' });
  }
  return ok({
    name,
    town,
    fleetSize,
    haulageType,
    website,
    phone,
    email,
    contactPerson,
    legalForm,
    relationship,
    stage,
    nextStep,
    nextStepOn,
    notes,
  });
}

/** A change to a firm: a field left out stays as it is, and `null` clears it. */
export type ProspectPatch = {
  readonly [K in keyof Omit<ProspectFields, 'name'>]?: ProspectFields[K] | null;
} & { readonly name?: string | undefined };

/** The firm with the patch applied, checked as a whole so a patch cannot leave it in a state a new firm could not be in. */
export function applyPatch(
  current: Prospect,
  patch: ProspectPatch,
): Result<Prospect, InvalidProspect> {
  const pick = <T>(given: T | null | undefined, existing: T | undefined): T | undefined =>
    given === undefined ? existing : given === null ? undefined : given;
  const checked = checkProspect({
    name: patch.name ?? current.name,
    town: pick(patch.town, current.town),
    fleetSize: pick(patch.fleetSize, current.fleetSize),
    haulageType: pick(patch.haulageType, current.haulageType),
    website: pick(patch.website, current.website),
    phone: pick(patch.phone, current.phone),
    email: pick(patch.email, current.email),
    contactPerson: pick(patch.contactPerson, current.contactPerson),
    legalForm: patch.legalForm ?? current.legalForm,
    relationship: patch.relationship ?? current.relationship,
    stage: patch.stage ?? current.stage,
    nextStep: pick(patch.nextStep, current.nextStep),
    nextStepOn: pick(patch.nextStepOn, current.nextStepOn),
    notes: pick(patch.notes, current.notes),
  });
  if (!checked.ok) return checked;
  return ok({ ...checked.value, id: current.id, createdAt: current.createdAt });
}

/** A firm that asked not to be contacted. It stays on the list for good, so it is never contacted by mistake. */
export const isOptedOut = (stage: Stage): boolean => stage === 'do_not_contact';

const rank = (stage: Stage): number => (PIPELINE as readonly string[]).indexOf(stage);

const STAGE_FOR_RESULT: Record<ContactResult, Stage> = {
  sent: 'contacted',
  replied: 'replied',
  conversation: 'conversation',
  demo: 'demo',
  pilot: 'pilot',
  not_interested: 'not_interested',
  opted_out: 'do_not_contact',
};

/**
 * The firm's stage after a contact. Pipeline stages only move forward (a phone call after a demo does not put them back at
 * "contacted"); saying no, or asking not to be contacted, always applies; and a firm that said no and then replies is back in
 * the pipeline.
 */
export function stageAfterEntry(current: Stage, result: ContactResult): Stage {
  const target = STAGE_FOR_RESULT[result];
  if (target === 'not_interested' || target === 'do_not_contact') return target;
  if (current === 'not_interested') return target;
  return rank(target) > rank(current) ? target : current;
}

/** The fields of a log entry, checked. */
export function checkEntry(input: {
  readonly how: string;
  readonly result: string;
  readonly pitch?: string | undefined;
  readonly note?: string | undefined;
}): Result<Pick<SalesEntry, 'how' | 'result' | 'pitch' | 'note'>, InvalidEntry> {
  if (!isOneOf(HOWS, input.how)) return err({ tag: 'InvalidEntry', field: 'how' });
  if (!isOneOf(RESULTS, input.result)) return err({ tag: 'InvalidEntry', field: 'result' });
  const pitch = clean(input.pitch);
  if (pitch !== undefined && !isOneOf(PITCHES, pitch)) {
    return err({ tag: 'InvalidEntry', field: 'pitch' });
  }
  const note = clean(input.note);
  if (note !== undefined && note.length > 1000) return err({ tag: 'InvalidEntry', field: 'note' });
  return ok({ how: input.how, result: input.result, pitch, note });
}

/** "Ltd", "Limited" and "Ltd." in a spreadsheet's cell are a limited company; a cell we do not know is "unknown", never a guess. */
export function readLegalForm(raw: string | undefined): LegalForm {
  const text = clean(raw)
    ?.toLowerCase()
    .replace(/[._\s-]+/g, ' ')
    .trim();
  if (text === undefined) return 'unknown';
  if (text === 'limited' || text === 'ltd' || text === 'limited company') return 'limited';
  if (text.includes('sole') || text.includes('partner')) return 'sole_trader_or_partnership';
  return 'unknown';
}

/** "Existing contact" and "warm" are someone the owner knows. Anything else is a cold contact. */
export function readRelationship(raw: string | undefined): Relationship {
  const text = clean(raw)?.toLowerCase();
  return text !== undefined && (text.startsWith('warm') || text.startsWith('existing'))
    ? 'warm'
    : 'new';
}

/** A fleet size as typed ("15", "about 15", "15 HGVs"): the first whole number in it, or nothing. */
export function readFleetSize(raw: string | undefined): number | undefined {
  const match = /\d+/.exec(raw ?? '');
  if (match === null) return undefined;
  const n = Number(match[0]);
  return n <= 10_000 ? n : undefined;
}
