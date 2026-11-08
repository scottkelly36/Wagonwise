import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  applyPatch,
  checkEntry,
  checkProspect,
  clean,
  isOptedOut,
  readFleetSize,
  readLegalForm,
  readRelationship,
  stageAfterEntry,
  type InvalidEntry,
  type InvalidProspect,
  type Prospect,
  type ProspectFields,
  type ProspectId,
  type ProspectPatch,
  type SalesEntry,
  type SalesEntryId,
} from '../domain/sales.js';

export type Forbidden = TaggedError<'Forbidden'>;
export type NotFound = TaggedError<'NotFound'>;
/** The firm asked not to be contacted: it cannot be logged against, moved back into the pipeline or deleted. */
export type OptedOut = TaggedError<'OptedOut'>;
/** Another firm already has that name. */
export type AlreadyListed = TaggedError<'AlreadyListed'>;

export type StaffCaller =
  | { readonly kind: 'platform' }
  | { readonly kind: 'fleet'; readonly companyId: string; readonly privileges: readonly string[] };

export interface CallerDirectory {
  getCaller(staffId: string): Promise<StaffCaller | null>;
}

export interface SalesRepository {
  /** By name. */
  listProspects(): Promise<Prospect[]>;
  /** Newest first. */
  listEntries(): Promise<SalesEntry[]>;
  findProspect(id: ProspectId): Promise<Prospect | null>;
  /** Adds the firm unless another has the same name (any case); says whether it was added. */
  insertIfNew(prospect: Prospect): Promise<boolean>;
  /** Whether another firm (not `exceptId`) already has this name. */
  nameTaken(name: string, exceptId?: ProspectId): Promise<boolean>;
  update(prospect: Prospect): Promise<boolean>;
  /** Adds the entry and saves the firm's new stage and next step together. */
  recordEntry(entry: SalesEntry, prospect: Prospect): Promise<void>;
  deleteProspect(id: ProspectId): Promise<boolean>;
  deleteEntry(id: SalesEntryId): Promise<boolean>;
}

export interface SalesDeps {
  readonly sales: SalesRepository;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

/** Every firm and every entry. WagonWise staff only. */
export async function listSales(
  deps: Pick<SalesDeps, 'sales'>,
  caller: StaffCaller,
): Promise<Result<{ prospects: Prospect[]; entries: SalesEntry[] }, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const [prospects, entries] = await Promise.all([
    deps.sales.listProspects(),
    deps.sales.listEntries(),
  ]);
  return ok({ prospects, entries });
}

/** Adds a firm. WagonWise staff only. */
export async function createProspect(
  deps: SalesDeps,
  caller: StaffCaller,
  fields: ProspectFields,
): Promise<Result<Prospect, Forbidden | InvalidProspect | AlreadyListed>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const checked = checkProspect(fields);
  if (!checked.ok) return checked;
  const prospect: Prospect = {
    ...checked.value,
    id: makeId<'ProspectId'>(deps.ids.newId()),
    createdAt: deps.clock.now(),
  };
  if (!(await deps.sales.insertIfNew(prospect))) return err({ tag: 'AlreadyListed' });
  return ok(prospect);
}

/**
 * Changes a firm. A firm that asked not to be contacted keeps that stage (its other details can still be tidied, for example
 * to remove a phone number), so a slip cannot put it back on the list to call.
 */
export async function updateProspect(
  deps: SalesDeps,
  caller: StaffCaller,
  id: ProspectId,
  patch: ProspectPatch,
): Promise<Result<Prospect, Forbidden | NotFound | InvalidProspect | OptedOut | AlreadyListed>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const current = await deps.sales.findProspect(id);
  if (current === null) return err({ tag: 'NotFound' });
  if (isOptedOut(current.stage) && patch.stage !== undefined && patch.stage !== current.stage) {
    return err({ tag: 'OptedOut' });
  }
  const changed = applyPatch(current, patch);
  if (!changed.ok) return changed;
  if (await deps.sales.nameTaken(changed.value.name, id)) return err({ tag: 'AlreadyListed' });
  if (!(await deps.sales.update(changed.value))) return err({ tag: 'NotFound' });
  return ok(changed.value);
}

/** Removes a firm and its log. Not a firm that asked not to be contacted: that record is the reminder never to. */
export async function deleteProspect(
  deps: Pick<SalesDeps, 'sales'>,
  caller: StaffCaller,
  id: ProspectId,
): Promise<Result<void, Forbidden | NotFound | OptedOut>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const current = await deps.sales.findProspect(id);
  if (current === null) return err({ tag: 'NotFound' });
  if (isOptedOut(current.stage)) return err({ tag: 'OptedOut' });
  return (await deps.sales.deleteProspect(id)) ? ok(undefined) : err({ tag: 'NotFound' });
}

export interface AddEntryInput {
  /** When it happened; now if left out. */
  readonly at?: Date | undefined;
  readonly how: string;
  readonly result: string;
  readonly pitch?: string | undefined;
  readonly note?: string | undefined;
  /** The firm's next step after this contact: left out keeps the old one, `null` clears it. */
  readonly nextStep?: string | null | undefined;
  readonly nextStepOn?: string | null | undefined;
}

/**
 * Logs a contact with a firm. The firm moves on a stage if the result says so, and the next step is saved with it. A firm
 * that asked not to be contacted refuses the entry. WagonWise staff only.
 */
export async function addEntry(
  deps: SalesDeps,
  caller: StaffCaller,
  prospectId: ProspectId,
  input: AddEntryInput,
): Promise<
  Result<{ prospect: Prospect; entry: SalesEntry }, Forbidden | NotFound | OptedOut | InvalidEntry>
> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const current = await deps.sales.findProspect(prospectId);
  if (current === null) return err({ tag: 'NotFound' });
  if (isOptedOut(current.stage)) return err({ tag: 'OptedOut' });
  const checked = checkEntry(input);
  if (!checked.ok) return checked;
  const stage = stageAfterEntry(current.stage, checked.value.result);
  const changed = applyPatch(current, {
    stage,
    nextStep: input.nextStep,
    nextStepOn: input.nextStepOn,
  });
  if (!changed.ok) {
    const field = changed.error.field === 'next_step_on' ? 'next_step_on' : 'next_step';
    return err({ tag: 'InvalidEntry', field });
  }
  const now = deps.clock.now();
  const entry: SalesEntry = {
    ...checked.value,
    id: makeId<'SalesEntryId'>(deps.ids.newId()),
    prospectId,
    at: input.at ?? now,
    createdAt: now,
  };
  await deps.sales.recordEntry(entry, changed.value);
  return ok({ prospect: changed.value, entry });
}

/** Removes one log entry (a slip). The firm's stage is left as it is. WagonWise staff only. */
export async function deleteEntry(
  deps: Pick<SalesDeps, 'sales'>,
  caller: StaffCaller,
  id: SalesEntryId,
): Promise<Result<void, Forbidden | NotFound>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  return (await deps.sales.deleteEntry(id)) ? ok(undefined) : err({ tag: 'NotFound' });
}

export interface ImportRowInput {
  readonly name: string;
  readonly town?: string | undefined;
  readonly fleetSize?: string | undefined;
  readonly haulageType?: string | undefined;
  readonly website?: string | undefined;
  readonly phone?: string | undefined;
  readonly email?: string | undefined;
  readonly contactPerson?: string | undefined;
  readonly legalForm?: string | undefined;
  readonly relationship?: string | undefined;
  readonly nextStep?: string | undefined;
  readonly notes?: string | undefined;
}

export interface ImportResult {
  readonly added: number;
  readonly skipped: { readonly name: string; readonly reason: 'already_listed' | 'invalid' }[];
}

/**
 * Adds firms from a spreadsheet's rows. A firm already listed (the same name in any case, or twice in the file) is skipped, and
 * so is a row that cannot be read, so the same file can be sent twice and add nothing the second time. A cell it does not
 * understand for the business type is "unknown", never a guess. WagonWise staff only.
 */
export async function importProspects(
  deps: SalesDeps,
  caller: StaffCaller,
  rows: readonly ImportRowInput[],
): Promise<Result<ImportResult, Forbidden>> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  let added = 0;
  const skipped: { name: string; reason: 'already_listed' | 'invalid' }[] = [];
  for (const row of rows) {
    const name = clean(row.name) ?? '';
    const checked = checkProspect({
      name,
      town: row.town,
      fleetSize: readFleetSize(row.fleetSize),
      haulageType: row.haulageType,
      website: row.website,
      phone: row.phone,
      email: row.email,
      contactPerson: row.contactPerson,
      legalForm: readLegalForm(row.legalForm),
      relationship: readRelationship(row.relationship),
      nextStep: row.nextStep,
      notes: row.notes,
    });
    if (!checked.ok) {
      skipped.push({ name, reason: 'invalid' });
      continue;
    }
    const inserted = await deps.sales.insertIfNew({
      ...checked.value,
      id: makeId<'ProspectId'>(deps.ids.newId()),
      createdAt: deps.clock.now(),
    });
    if (inserted) added += 1;
    else skipped.push({ name: checked.value.name, reason: 'already_listed' });
  }
  return ok({ added, skipped });
}
