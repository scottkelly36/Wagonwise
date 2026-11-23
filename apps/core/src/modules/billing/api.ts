import type { FastifyInstance } from 'fastify';
import { makeId } from '../../shared/brand.js';
import type { Clock } from '../../shared/ports/clock.js';
import type { DataScopes } from '../../shared/ports/data-scope.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import { totalPence } from './domain/invoice.js';
import { vehicleCapacityToday } from './application/plans.js';
import type { CompanyDirectory } from './application/ports/company-directory.js';
import type { CallerDirectory } from './application/ports/directories.js';
import type { UntypedDb } from './infrastructure/db.js';
import { PostgresBillingDetailsRepository } from './infrastructure/postgres-billing-details-repository.js';
import { PostgresCostRepository } from './infrastructure/postgres-cost-repository.js';
import { PostgresInvoiceRepository } from './infrastructure/postgres-invoice-repository.js';
import { PostgresPlanRepository } from './infrastructure/postgres-plan-repository.js';
import { registerBillingRoutes } from './interface/routes.js';
import type { VehicleCount } from './application/ports/vehicle-count.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/db.js';
export type { CallerDirectory, StaffCaller } from './application/ports/directories.js';
export type { CompanyDirectory } from './application/ports/company-directory.js';
export type { VehicleCount } from './application/ports/vehicle-count.js';

export interface BillingModuleDeps {
  readonly db: UntypedDb;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly dataScopes: DataScopes;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** The companies WagonWise bills. Supplied by composition over `companies`. */
  readonly companies: CompanyDirectory;
  /** How many vehicles a company has now. Supplied by composition over `fleet`. */
  readonly vehicles: VehicleCount;
}

export interface BillingModule {
  registerRoutes(app: FastifyInstance): void;
  /**
   * How many vehicles a company's plan covers today (0 when it has no plan). For `fleet`, which refuses to
   * create a vehicle beyond it; supplied by composition. Reads inside the caller's own data scope: a
   * company can read its own plan, a WagonWise admin any.
   */
  vehicleCapacityFor(companyId: string): Promise<number>;
  /**
   * For `payments`: one invoice as far as collecting it matters. `null` for an unknown id. Runs in the caller's data scope, which must be
   * WagonWise staff's.
   */
  findInvoiceForCollection(invoiceId: string): Promise<InvoiceForCollection | null>;
  /** For `payments`: how many of a company's invoices are issued and not yet paid. Runs in the caller's data scope (WagonWise staff's). */
  countUnpaidInvoices(companyId: string): Promise<number>;
  /**
   * For `payments`: records that an invoice was paid (money received), once. Safe to repeat: an invoice already paid answers
   * `already_paid`. Runs in the caller's data scope (WagonWise staff's).
   */
  settleInvoice(invoiceId: string): Promise<'paid' | 'already_paid' | 'not_found' | 'not_issued'>;
}

export interface InvoiceForCollection {
  readonly id: string;
  readonly companyId: string;
  readonly number: string | undefined;
  readonly status: 'draft' | 'issued' | 'paid' | 'void';
  readonly totalPence: number;
}

/**
 * `billing`'s only public surface (AGENTS.md rule 6): what WagonWise charges companies. WagonWise's own
 * billing details, and each company's plan: a price per vehicle and the vehicle capacity it covers.
 * Invoices follow.
 */
export function createBillingModule(deps: BillingModuleDeps): BillingModule {
  const details = new PostgresBillingDetailsRepository(deps.db);
  const plans = new PostgresPlanRepository(deps.db);
  const invoices = new PostgresInvoiceRepository(deps.db);
  const costs = new PostgresCostRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerBillingRoutes(app, {
        billing: { repo: details, clock: deps.clock },
        plans: { plans, companies: deps.companies, clock: deps.clock },
        invoices: {
          invoices,
          details,
          plans,
          companies: deps.companies,
          ids: deps.ids,
          clock: deps.clock,
        },
        own: { plans, invoices, vehicles: deps.vehicles, clock: deps.clock },
        finance: {
          costs,
          invoices,
          plans,
          companies: deps.companies,
          ids: deps.ids,
          clock: deps.clock,
        },
        callerDirectory: deps.callers,
        dataScopes: deps.dataScopes,
      });
    },
    vehicleCapacityFor: (companyId) =>
      vehicleCapacityToday({ plans, clock: deps.clock }, makeId<'CompanyId'>(companyId)),
    async findInvoiceForCollection(invoiceId) {
      const invoice = await invoices.findById(makeId<'InvoiceId'>(invoiceId));
      return invoice === null
        ? null
        : {
            id: invoice.id,
            companyId: invoice.companyId,
            number: invoice.number,
            status: invoice.status,
            totalPence: totalPence(invoice.lines),
          };
    },
    async countUnpaidInvoices(companyId) {
      const issued = await invoices.listIssuedForCompany(makeId<'CompanyId'>(companyId));
      return issued.filter((i) => i.status === 'issued').length;
    },
    async settleInvoice(invoiceId) {
      const id = makeId<'InvoiceId'>(invoiceId);
      const invoice = await invoices.findById(id);
      if (invoice === null) return 'not_found';
      if (invoice.status === 'paid') return 'already_paid';
      if (invoice.status !== 'issued') return 'not_issued';
      await invoices.markPaid(id, deps.clock.now());
      return 'paid';
    },
  };
}
