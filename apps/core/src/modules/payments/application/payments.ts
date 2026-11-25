import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import type { Collection } from '../domain/payment-event.js';
import type {
  AccountFacts,
  CallerDirectory,
  CompanyNames,
  InvoiceLedger,
  OwnerNotice,
  StaffCaller,
} from './ports/directories.js';
import type { PaymentProvider } from './ports/payment-provider.js';
import type {
  CollectionRepository,
  PaymentCustomerRepository,
  ProcessedEventRepository,
} from './ports/repositories.js';

export type Forbidden = TaggedError<'Forbidden'>;
/** No payment provider is connected, so there is nothing to start or collect. */
export type NotAvailable = TaggedError<'NotAvailable'>;
export type InvoiceNotFound = TaggedError<'InvoiceNotFound'>;
/** Only an issued invoice (not a draft, a paid or a cancelled one) can be collected. */
export interface InvoiceNotDue extends TaggedError<'InvoiceNotDue'> {
  readonly status: string;
}
/** The company has not finished adding payment details. */
export type NoPaymentDetails = TaggedError<'NoPaymentDetails'>;
/** The invoice already has an attempt in progress. */
export type AlreadyCollecting = TaggedError<'AlreadyCollecting'>;
/** The provider could not be asked. Nothing was recorded, so it can be tried again. */
export type ProviderFailed = TaggedError<'ProviderFailed'>;

export interface PaymentsDeps {
  readonly provider: PaymentProvider;
  readonly customers: PaymentCustomerRepository;
  readonly collections: CollectionRepository;
  readonly processed: ProcessedEventRepository;
  readonly ledger: InvoiceLedger;
  readonly accounts: AccountFacts;
  readonly names: CompanyNames;
  readonly callers?: CallerDirectory | undefined;
  readonly ownerNotice?: OwnerNotice | undefined;
  /** The portal's address, for where the provider sends a company back to. */
  readonly dashboardUrl: string | undefined;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

/** Only the people a company has trusted with billing, and only for their own company. */
function ownCompany(caller: StaffCaller): string | undefined {
  return caller.kind === 'fleet' && caller.privileges.includes('manage_billing')
    ? caller.companyId
    : undefined;
}

export interface OwnPaymentStatus {
  readonly available: boolean;
  readonly detailsOnFile: boolean;
}

/** Whether the company can add payment details here, and whether it has. For its billing page. */
export async function getOwnPaymentStatus(
  deps: PaymentsDeps,
  caller: StaffCaller,
): Promise<Result<OwnPaymentStatus, Forbidden>> {
  const companyId = ownCompany(caller);
  if (companyId === undefined) return err({ tag: 'Forbidden' });
  const customer = await deps.customers.get(companyId);
  return ok({
    available: deps.provider.available,
    detailsOnFile: customer?.detailsOnFile ?? false,
  });
}

/** WagonWise staff: a company's payment details and the latest attempts to collect from it. */
export async function getCompanyPayments(
  deps: PaymentsDeps,
  caller: StaffCaller,
  companyId: string,
): Promise<
  Result<
    { available: boolean; detailsOnFile: boolean; collections: readonly Collection[] },
    Forbidden
  >
> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  const [customer, collections] = await Promise.all([
    deps.customers.get(companyId),
    deps.collections.listForCompany(companyId, 10),
  ]);
  return ok({
    available: deps.provider.available,
    detailsOnFile: customer?.detailsOnFile ?? false,
    collections,
  });
}

/** Whether a company has finished adding payment details. For the rules that decide what a finished free period becomes. */
export async function hasPaymentDetails(deps: PaymentsDeps, companyId: string): Promise<boolean> {
  return (await deps.customers.get(companyId))?.detailsOnFile ?? false;
}

/**
 * A company's billing person asks to add payment details: a hosted page at the provider, which comes back to the plan page. Nothing is
 * charged and no card or bank number is seen here. The company's row is noted so the page can say "in progress" later if it wants to.
 */
export async function startPaymentSetup(
  deps: PaymentsDeps,
  caller: StaffCaller,
): Promise<Result<{ url: string }, Forbidden | NotAvailable>> {
  const companyId = ownCompany(caller);
  if (companyId === undefined) return err({ tag: 'Forbidden' });
  if (!deps.provider.available) return err({ tag: 'NotAvailable' });
  const base = (deps.dashboardUrl ?? '').replace(/\/+$/, '');
  const session = await deps.provider.createSetupSession({
    existingRef: (await deps.customers.get(companyId))?.providerRef ?? null,
    companyId,
    companyName: (await deps.names.nameOf(companyId)) ?? 'your company',
    returnUrl: `${base}/staff/plan?payment=done`,
  });
  await deps.customers.upsert({
    companyId,
    provider: deps.provider.name,
    providerRef: session.providerRef ?? null,
    at: deps.clock.now(),
  });
  return ok({ url: session.url });
}

/**
 * WagonWise staff ask the provider to collect an issued invoice from the company's payment method. Only an issued invoice, only a company
 * with payment details, and only once at a time. The outcome arrives by message (`handlePaymentMessage`); until then the attempt is open.
 * Nothing is collected by itself: a person presses the button.
 */
export async function collectInvoice(
  deps: PaymentsDeps,
  caller: StaffCaller,
  invoiceId: string,
): Promise<
  Result<
    { amountPence: number },
    | Forbidden
    | NotAvailable
    | InvoiceNotFound
    | InvoiceNotDue
    | NoPaymentDetails
    | AlreadyCollecting
    | ProviderFailed
  >
> {
  if (caller.kind !== 'platform') return err({ tag: 'Forbidden' });
  if (!deps.provider.available) return err({ tag: 'NotAvailable' });
  const invoice = await deps.ledger.find(invoiceId);
  if (invoice === null) return err({ tag: 'InvoiceNotFound' });
  if (invoice.status !== 'issued') return err({ tag: 'InvoiceNotDue', status: invoice.status });
  if (invoice.totalPence <= 0) return err({ tag: 'InvoiceNotDue', status: 'nothing to pay' });
  if (!(await hasPaymentDetails(deps, invoice.companyId))) return err({ tag: 'NoPaymentDetails' });

  const now = deps.clock.now();
  // Recorded first: the unique open attempt per invoice is what stops two presses charging twice.
  const attemptId = deps.ids.newId();
  const opened = await deps.collections.open({
    id: attemptId,
    companyId: invoice.companyId,
    invoiceId: invoice.id,
    amountPence: invoice.totalPence,
    status: 'requested',
    requestedBy: caller.staffId,
    requestedAt: now,
    settledAt: null,
    failureReason: null,
  });
  if (!opened) return err({ tag: 'AlreadyCollecting' });

  try {
    await deps.provider.collect({
      companyId: invoice.companyId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      amountPence: invoice.totalPence,
      attemptId,
      customerRef: (await deps.customers.get(invoice.companyId))?.providerRef ?? null,
    });
  } catch {
    // Not asked: give the attempt back as failed so it can be tried again, and say so.
    await deps.collections.settle(
      invoice.id,
      'failed',
      deps.clock.now(),
      'the provider could not be asked',
    );
    return err({ tag: 'ProviderFailed' });
  }
  return ok({ amountPence: invoice.totalPence });
}

export type MessageOutcome =
  'invalid_signature' | 'ignored' | 'duplicate' | 'applied' | 'amount_mismatch' | 'unknown_invoice';

async function tellOwner(deps: PaymentsDeps, subject: string, text: string): Promise<void> {
  if (deps.ownerNotice === undefined) return;
  try {
    await deps.ownerNotice.send(subject, text);
  } catch {
    // A courtesy; what the message did is already done.
  }
}

/**
 * A message from the payment provider. Checked first: one that is not signed by the provider is refused and nothing else is read. A
 * message already dealt with does nothing. Otherwise:
 *
 * - details added: the company is marked as having them, and its account is told (back to active if it was behind and nothing is owed);
 * - an invoice paid: it is marked paid, once, and if nothing else is owed the account is told (back to active);
 * - a payment failed: the attempt is closed as failed and the account is told (an active company becomes overdue, if the rules are on);
 * - a paid amount that is not the invoice's total, or an invoice that is not the company's: nothing is changed and the owner is told.
 *
 * Every effect is safe to repeat, and the message is remembered last, so one that failed half way is simply handled again when the
 * provider sends it again. Runs in WagonWise staff's data scope, which the caller opens, so an invoice and its company move together.
 */
export async function handlePaymentMessage(
  deps: PaymentsDeps,
  input: { readonly body: string; readonly signature?: string | undefined },
): Promise<MessageOutcome> {
  const now = deps.clock.now();
  const read = deps.provider.readEvent({ body: input.body, signature: input.signature, now });
  if (!read.ok) return 'invalid_signature';
  const event = read.event;
  if (event === null) return 'ignored';
  if (await deps.processed.has(event.id)) return 'duplicate';

  let outcome: MessageOutcome = 'applied';
  switch (event.kind) {
    case 'setup_completed': {
      await deps.customers.upsert({
        companyId: event.companyId,
        provider: deps.provider.name,
        providerRef: event.providerRef ?? null,
        detailsOnFile: true,
        at: now,
      });
      const owes = (await deps.ledger.countUnpaid(event.companyId)) > 0;
      await deps.accounts.record(event.companyId, { kind: 'details_added', owesAnything: owes });
      break;
    }
    case 'payment_method_removed': {
      await deps.customers.upsert({
        companyId: event.companyId,
        provider: deps.provider.name,
        detailsOnFile: false,
        at: now,
      });
      break;
    }
    case 'payment_succeeded': {
      const invoice = await deps.ledger.find(event.invoiceId);
      if (invoice === null || invoice.companyId !== event.companyId) {
        outcome = 'unknown_invoice';
        await tellOwner(
          deps,
          'A payment arrived for an invoice WagonWise cannot find',
          `The payment provider says invoice ${event.invoiceId} (company ${event.companyId}) was paid ${event.amountPence / 100} GBP, but it is not one of this company's invoices. Nothing was changed.`,
        );
        break;
      }
      if (invoice.totalPence !== event.amountPence) {
        outcome = 'amount_mismatch';
        await deps.collections.settle(
          invoice.id,
          'failed',
          now,
          `paid ${event.amountPence} pence, invoice total ${invoice.totalPence} pence`,
        );
        await tellOwner(
          deps,
          `A payment for ${invoice.number ?? 'an invoice'} is not the amount of the invoice`,
          `The payment provider says ${event.amountPence / 100} GBP was paid, but the invoice total is ${invoice.totalPence / 100} GBP. The invoice was NOT marked paid and the account was not changed. Check the payment.`,
        );
        break;
      }
      await deps.ledger.settle(invoice.id);
      await deps.collections.settle(invoice.id, 'paid', now);
      const owes = (await deps.ledger.countUnpaid(event.companyId)) > 0;
      await deps.accounts.record(event.companyId, { kind: 'paid_in_full', owesAnything: owes });
      break;
    }
    case 'payment_failed': {
      await deps.collections.settle(event.invoiceId, 'failed', now, event.reason);
      await deps.accounts.record(event.companyId, { kind: 'payment_failed', owesAnything: true });
      await tellOwner(
        deps,
        'A payment failed',
        `Collecting invoice ${event.invoiceId} for company ${event.companyId} failed${event.reason === undefined ? '' : `: ${event.reason}`}.`,
      );
      break;
    }
  }
  await deps.processed.add(event.id, event.kind, now);
  return outcome;
}
