import type {
  CompanyId,
  FuelImport,
  FuelImportId,
  FuelTransaction,
  FuelTransactionId,
  StaffId,
  VehicleId,
} from '../domain/fuel.js';

/** Who a signed-in staff account is, as far as costing's permission rules care. */
export type StaffCaller =
  | { readonly kind: 'platform' }
  | {
      readonly kind: 'fleet';
      readonly companyId: CompanyId;
      readonly privileges: readonly string[];
    };

export interface CallerDirectory {
  /** `null` for an unknown or removed account. */
  getCaller(staffId: StaffId): Promise<StaffCaller | null>;
}

export interface VehicleSummary {
  readonly id: VehicleId;
  readonly name: string;
  readonly registration: string | undefined;
}

/** The company's vehicles. Supplied by composition over `fleet` (AGENTS.md rule 7). */
export interface VehicleDirectory {
  listForCompany(companyId: CompanyId): Promise<readonly VehicleSummary[]>;
  /** A vehicle's company and name, or `null`. */
  find(vehicleId: VehicleId): Promise<(VehicleSummary & { readonly companyId: CompanyId }) | null>;
}

export interface FuelRepository {
  /** Saves the import and the purchases not already held (by dedupe key); says which of the keys were new. */
  saveImport(
    fuelImport: FuelImport,
    transactions: readonly FuelTransaction[],
  ): Promise<ReadonlySet<string>>;
  /** Which of these dedupe keys the company already holds. */
  existingKeys(companyId: CompanyId, keys: readonly string[]): Promise<ReadonlySet<string>>;
  /** Purchases from `from` (inclusive) to `to` (exclusive), newest first. */
  listBetween(companyId: CompanyId, from: Date, to: Date): Promise<FuelTransaction[]>;
  /** Purchases not matched to a vehicle, newest first. */
  listUnmatched(companyId: CompanyId): Promise<FuelTransaction[]>;
  findTransaction(id: FuelTransactionId): Promise<FuelTransaction | null>;
  setVehicle(id: FuelTransactionId, vehicleId: VehicleId | undefined): Promise<void>;
  listImports(companyId: CompanyId): Promise<FuelImport[]>;
  findImport(id: FuelImportId): Promise<FuelImport | null>;
  /** Deletes the import and every purchase it brought. */
  deleteImport(id: FuelImportId): Promise<void>;
}
