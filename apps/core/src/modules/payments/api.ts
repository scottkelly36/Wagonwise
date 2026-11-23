import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import { hasPaymentDetails, type PaymentsDeps } from './application/payments.js';
import type {
  AccountFacts,
  CallerDirectory,
  CompanyNames,
  InvoiceLedger,
  OwnerNotice,
} from './application/ports/directories.js';
import type { PaymentProvider } from './application/ports/payment-provider.js';
import { NotConfiguredPaymentProvider } from './infrastructure/not-configured-payment-provider.js';
import {
  PostgresCollectionRepository,
  PostgresPaymentCustomerRepository,
  PostgresProcessedEventRepository,
  type UntypedDb,
} from './infrastructure/postgres-repositories.js';
import { registerPaymentRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/postgres-repositories.js';
export type {
  AccountFacts,
  CallerDirectory,
  CompanyNames,
  InvoiceLedger,
  OwnerNotice,
  StaffCaller,
} from './application/ports/directories.js';
export type { PaymentProvider } from './application/ports/payment-provider.js';

export interface PaymentsModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** Invoices, as far as collecting them goes. Supplied by composition over `billing`. */
  readonly ledger: InvoiceLedger;
  /** What the provider's messages tell a company's account. Supplied by composition over `companies`. */
  readonly accounts: AccountFacts;
  readonly names: CompanyNames;
  /** The payment provider; undefined until one is connected (the owner opens the account first). */
  readonly provider?: PaymentProvider | undefined;
  readonly ownerNotice?: OwnerNotice | undefined;
  /** The portal's address (config's DASHBOARD_URL), for where the provider sends a company back to. */
  readonly dashboardUrl?: string | undefined;
}

export interface PaymentsModule {
  registerRoutes(app: FastifyInstance): void;
  /**
   * Whether a company has finished adding payment details, for `companies`' rules (a finished free period becomes active, not overdue,
   * when they are). Runs in the caller's data scope, which must be WagonWise staff's.
   */
  hasPaymentMethod(companyId: string): Promise<boolean>;
}

/**
 * `payments`' only public surface (AGENTS.md rule 6): the payment provider's side of billing. A company adds payment details on the
 * provider's hosted page, WagonWise staff ask for an issued invoice to be collected, and the provider's messages (details added, paid,
 * failed) move the invoice and the company's account. WagonWise's own records of plans and invoices stay in `billing`. With no provider
 * connected (`NotConfiguredPaymentProvider`) the module is inert: nothing is offered and every message is refused.
 */
export function createPaymentsModule(deps: PaymentsModuleDeps): PaymentsModule {
  const payments: PaymentsDeps = {
    provider: deps.provider ?? new NotConfiguredPaymentProvider(),
    customers: new PostgresPaymentCustomerRepository(deps.db),
    collections: new PostgresCollectionRepository(deps.db),
    processed: new PostgresProcessedEventRepository(deps.db),
    ledger: deps.ledger,
    accounts: deps.accounts,
    names: deps.names,
    ownerNotice: deps.ownerNotice,
    dashboardUrl: deps.dashboardUrl,
    clock: deps.clock,
    ids: deps.ids,
  };
  return {
    registerRoutes(app: FastifyInstance): void {
      registerPaymentRoutes(app, {
        payments,
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
    hasPaymentMethod: (companyId) => hasPaymentDetails(payments, companyId),
  };
}
