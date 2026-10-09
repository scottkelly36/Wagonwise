import type { CompanyId } from '../../domain/fuel.js';
import type {
  DriverId,
  DriverRate,
  DriverRateId,
  MonthString,
  RunningCost,
  RunningCostId,
} from '../../domain/inputs.js';
import type {
  DriverDirectory,
  DriverRateRepository,
  RunningCostRepository,
} from '../inputs-ports.js';

export class InMemoryRunningCosts implements RunningCostRepository {
  readonly rows = new Map<RunningCostId, RunningCost>();

  findById(id: RunningCostId): Promise<RunningCost | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  listForCompany(companyId: CompanyId): Promise<RunningCost[]> {
    return Promise.resolve([...this.rows.values()].filter((c) => c.companyId === companyId));
  }

  insert(cost: RunningCost): Promise<void> {
    this.rows.set(cost.id, cost);
    return Promise.resolve();
  }

  updateFields(
    id: RunningCostId,
    fields: { description: string; monthlyPence: number },
  ): Promise<void> {
    const c = this.rows.get(id);
    if (c !== undefined) this.rows.set(id, { ...c, ...fields });
    return Promise.resolve();
  }

  setToMonth(id: RunningCostId, toMonth: MonthString): Promise<void> {
    const c = this.rows.get(id);
    if (c !== undefined) this.rows.set(id, { ...c, toMonth });
    return Promise.resolve();
  }

  delete(id: RunningCostId): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryDriverRates implements DriverRateRepository {
  readonly rows = new Map<DriverRateId, DriverRate>();

  findById(id: DriverRateId): Promise<DriverRate | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  listForCompany(companyId: CompanyId): Promise<DriverRate[]> {
    return Promise.resolve([...this.rows.values()].filter((r) => r.companyId === companyId));
  }

  upsert(rate: DriverRate): Promise<void> {
    for (const [id, r] of this.rows) {
      if (
        r.companyId === rate.companyId &&
        r.driverId === rate.driverId &&
        r.fromDay === rate.fromDay
      ) {
        this.rows.delete(id);
      }
    }
    this.rows.set(rate.id, rate);
    return Promise.resolve();
  }

  delete(id: DriverRateId): Promise<void> {
    this.rows.delete(id);
    return Promise.resolve();
  }
}

export class FakeDriverDirectory implements DriverDirectory {
  constructor(private readonly byCompany: Map<CompanyId, { id: DriverId; name: string }[]>) {}

  listForCompany(companyId: CompanyId): Promise<{ id: DriverId; name: string }[]> {
    return Promise.resolve(this.byCompany.get(companyId) ?? []);
  }

  belongsToCompany(driverId: DriverId, companyId: CompanyId): Promise<boolean> {
    return Promise.resolve((this.byCompany.get(companyId) ?? []).some((d) => d.id === driverId));
  }
}
