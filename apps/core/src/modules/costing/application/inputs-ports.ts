import type { CompanyId } from '../domain/fuel.js';
import type {
  DriverId,
  DriverRate,
  DriverRateId,
  MonthString,
  RunningCost,
  RunningCostId,
} from '../domain/inputs.js';

export interface RunningCostRepository {
  findById(id: RunningCostId): Promise<RunningCost | null>;
  /** Every running cost of the company, ended ones too, newest first. */
  listForCompany(companyId: CompanyId): Promise<RunningCost[]>;
  insert(cost: RunningCost, by: string, at: Date): Promise<void>;
  updateFields(
    id: RunningCostId,
    fields: { description: string; monthlyPence: number },
  ): Promise<void>;
  setToMonth(id: RunningCostId, toMonth: MonthString): Promise<void>;
  delete(id: RunningCostId): Promise<void>;
}

export interface DriverRateRepository {
  findById(id: DriverRateId): Promise<DriverRate | null>;
  listForCompany(companyId: CompanyId): Promise<DriverRate[]>;
  /** Sets the rate from a day; a rate already starting that day is replaced. */
  upsert(rate: DriverRate, by: string, at: Date): Promise<void>;
  delete(id: DriverRateId): Promise<void>;
}

/** The company's drivers (active members), with the name staff know them by. Supplied by composition over `fleet`. */
export interface DriverDirectory {
  listForCompany(
    companyId: CompanyId,
  ): Promise<readonly { readonly id: DriverId; readonly name: string }[]>;
  belongsToCompany(driverId: DriverId, companyId: CompanyId): Promise<boolean>;
}
