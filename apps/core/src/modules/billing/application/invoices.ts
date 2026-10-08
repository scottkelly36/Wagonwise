import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { placeholderFields, type StaffId } from '../domain/billing-details.js';
import {
  buildPlanLines,
  totalPence,
  validateManualLine,
  validateMonth,
  type BillingDetailsIncomplete,
  type InvalidInvoiceState,
  type InvalidLine,
  type InvalidMonth,
  type Invoice,
  type InvoiceId,
  type InvoiceLineId,
  type InvoiceNotFound,
  type MonthString,
  type NegativeTotal,
} from '../domain/invoice.js';
import { DEFAULT_PRICE_PER_VEHICLE_PENCE, ukDay } from '../domain/plan.js';
import type { BillingDetailsRepository } from './ports/billing-details-repository.js';
import type { CompanyDirectory } from './ports/company-directory.js';
import type { StaffCaller } from './ports/directories.js';
import type { InvoiceRepository } from './ports/invoice-repository.js';
import type { PlanRepository } from './ports/plan-repository.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** Invoices are for a month that has started: not one still to come. */
export type MonthNotStarted = TaggedError<'MonthNotStarted'>;
export type EmptyInvoice = TaggedError<'EmptyInvoice'>;

export interface InvoiceDeps {
  readonly invoices: InvoiceRepository;
  readonly details: BillingDetailsRepository;
  readonly plans: PlanRepository;
  readonly companies: CompanyDirectory;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

const isAdmin = (caller: StaffCaller): boolean => caller.kind === 'platform';
const forbidden = (): Result<never, Forbidden> => err({ tag: 'Forbidden' });

export interface GenerateOutcome {
  readonly created: readonly Invoice[];
  /** Companies left alone, and why: already invoiced for the month, or nothing to bill. */
  readonly skipped: readonly {
    readonly companyId: string;
    readonly name: string;
    readonly reason: 'already_invoiced' | 'nothing_to_bill';
  }[];
}

/**
 * Drafts the month's invoice for every company that has something to bill and none yet: capacity times
 * price, split where capacity rose part-way through. Safe to run twice; a company with a live invoice for
 * the month is left alone, so nothing is invoiced twice. The drafts are reviewed before anything is issued.
 */
export async function generateInvoices(
  deps: InvoiceDeps,
  caller: StaffCaller,
  staffId: StaffId,
  rawMonth: string,
): Promise<Result<GenerateOutcome, Forbidden | InvalidMonth | MonthNotStarted>> {
  if (!isAdmin(caller)) return forbidden();
  const month = validateMonth(rawMonth);
  if (!month.ok) return month;
  if (`${month.value}-01` > ukDay(deps.clock.now())) return err({ tag: 'MonthNotStarted' });

  const [companies, prices, changes] = await Promise.all([
    deps.companies.list(),
    deps.plans.listPrices(),
    deps.plans.listAllChanges(),
  ]);
  const created: Invoice[] = [];
  const skipped: GenerateOutcome['skipped'][number][] = [];

  for (const company of companies) {
    if ((await deps.invoices.findLive(company.id, month.value)) !== null) {
      skipped.push({ companyId: company.id, name: company.name, reason: 'already_invoiced' });
      continue;
    }
    const planned = buildPlanLines(
      changes.filter((c) => c.companyId === company.id),
      prices.get(company.id) ?? DEFAULT_PRICE_PER_VEHICLE_PENCE,
      month.value,
    );
    if (planned.length === 0) {
      skipped.push({ companyId: company.id, name: company.name, reason: 'nothing_to_bill' });
      continue;
    }
    const invoice: Invoice = {
      id: makeId<'InvoiceId'>(deps.ids.newId()),
      companyId: company.id,
      companyName: company.name,
      month: month.value,
      status: 'draft',
      number: undefined,
      lines: planned.map((l) => ({ ...l, id: makeId<'InvoiceLineId'>(deps.ids.newId()) })),
      createdAt: deps.clock.now(),
      issuedAt: undefined,
      paidAt: undefined,
      voidedAt: undefined,
      issuedDetails: undefined,
    };
    await deps.invoices.insertDraft(invoice, staffId);
    created.push(invoice);
  }
  return ok({ created, skipped });
}

export async function listInvoices(
  deps: Pick<InvoiceDeps, 'invoices'>,
  caller: StaffCaller,
): Promise<Result<Invoice[], Forbidden>> {
  if (!isAdmin(caller)) return forbidden();
  return ok(await deps.invoices.list());
}

export async function getInvoice(
  deps: Pick<InvoiceDeps, 'invoices'>,
  caller: StaffCaller,
  id: InvoiceId,
): Promise<Result<Invoice, Forbidden | InvoiceNotFound>> {
  if (!isAdmin(caller)) return forbidden();
  const invoice = await deps.invoices.findById(id);
  return invoice === null ? err({ tag: 'InvoiceNotFound' }) : ok(invoice);
}

/** Loads the invoice for a change that is only allowed while it is still a draft. */
async function editableDraft(
  deps: Pick<InvoiceDeps, 'invoices'>,
  caller: StaffCaller,
  id: InvoiceId,
): Promise<Result<Invoice, Forbidden | InvoiceNotFound | InvalidInvoiceState>> {
  const found = await getInvoice(deps, caller, id);
  if (!found.ok) return found;
  return found.value.status === 'draft'
    ? found
    : err({ tag: 'InvalidInvoiceState', status: found.value.status });
}

/** A credit, a set-up charge, or any one-off line, on a draft. A credit is a negative amount. */
export async function addManualLine(
  deps: InvoiceDeps,
  caller: StaffCaller,
  id: InvoiceId,
  input: { readonly description: string; readonly amountPence: number },
): Promise<Result<Invoice, Forbidden | InvoiceNotFound | InvalidInvoiceState | InvalidLine>> {
  const draft = await editableDraft(deps, caller, id);
  if (!draft.ok) return draft;
  const line = validateManualLine(input.description, input.amountPence);
  if (!line.ok) return line;
  await deps.invoices.addLine(id, {
    id: makeId<'InvoiceLineId'>(deps.ids.newId()),
    description: line.value.description,
    quantity: 1,
    unitPence: line.value.amountPence,
    amountPence: line.value.amountPence,
  });
  return getInvoice(deps, caller, id);
}

export async function removeLine(
  deps: InvoiceDeps,
  caller: StaffCaller,
  id: InvoiceId,
  lineId: InvoiceLineId,
): Promise<Result<Invoice, Forbidden | InvoiceNotFound | InvalidInvoiceState>> {
  const draft = await editableDraft(deps, caller, id);
  if (!draft.ok) return draft;
  await deps.invoices.removeLine(id, lineId);
  return getInvoice(deps, caller, id);
}

/** Throws a draft away, for when it should be generated afresh. Issued invoices are voided, never deleted. */
export async function deleteDraft(
  deps: InvoiceDeps,
  caller: StaffCaller,
  id: InvoiceId,
): Promise<Result<void, Forbidden | InvoiceNotFound | InvalidInvoiceState>> {
  const draft = await editableDraft(deps, caller, id);
  if (!draft.ok) return draft;
  await deps.invoices.deleteDraft(id);
  return ok(undefined);
}

/**
 * Gives a draft its number and freezes it, with WagonWise's billing details as they are today. Refused while
 * any of those details still holds a [placeholder], when the invoice has no lines, or when it would total less
 * than nothing.
 */
export async function issueInvoice(
  deps: InvoiceDeps,
  caller: StaffCaller,
  id: InvoiceId,
): Promise<
  Result<
    Invoice,
    | Forbidden
    | InvoiceNotFound
    | InvalidInvoiceState
    | BillingDetailsIncomplete
    | EmptyInvoice
    | NegativeTotal
  >
> {
  const draft = await editableDraft(deps, caller, id);
  if (!draft.ok) return draft;
  const { details } = await deps.details.get();
  const missing = placeholderFields(details);
  if (missing.length > 0) return err({ tag: 'BillingDetailsIncomplete', fields: missing });
  if (draft.value.lines.length === 0) return err({ tag: 'EmptyInvoice' });
  if (totalPence(draft.value.lines) < 0) return err({ tag: 'NegativeTotal' });

  const sequence = await deps.invoices.nextSequence();
  await deps.invoices.markIssued(id, {
    number: `INV-${String(sequence).padStart(4, '0')}`,
    sequence,
    at: deps.clock.now(),
    details,
  });
  return getInvoice(deps, caller, id);
}

export async function markInvoicePaid(
  deps: InvoiceDeps,
  caller: StaffCaller,
  id: InvoiceId,
): Promise<Result<Invoice, Forbidden | InvoiceNotFound | InvalidInvoiceState>> {
  const found = await getInvoice(deps, caller, id);
  if (!found.ok) return found;
  if (found.value.status !== 'issued') {
    return err({ tag: 'InvalidInvoiceState', status: found.value.status });
  }
  await deps.invoices.markPaid(id, deps.clock.now());
  return getInvoice(deps, caller, id);
}

/** Cancels an issued invoice that has not been paid. It keeps its number, and the month can be invoiced again. */
export async function voidInvoice(
  deps: InvoiceDeps,
  caller: StaffCaller,
  id: InvoiceId,
): Promise<Result<Invoice, Forbidden | InvoiceNotFound | InvalidInvoiceState>> {
  const found = await getInvoice(deps, caller, id);
  if (!found.ok) return found;
  if (found.value.status !== 'issued') {
    return err({ tag: 'InvalidInvoiceState', status: found.value.status });
  }
  await deps.invoices.markVoid(id, deps.clock.now());
  return getInvoice(deps, caller, id);
}

export type { MonthString };
