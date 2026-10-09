import type { CompanyId, DriverId, HoursStatus, StaffId } from '../domain/hours.js';

/** Who a signed-in staff account is, as far as the hours rules care. */
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

/** A driver's own identifier, for the `driver` data scope. Supplied by composition over identity. */
export interface DriverIdentityDirectory {
  getIdentifier(driverId: DriverId): Promise<string | null>;
}

/** The companies a driver is an active member of, with their names. Supplied by composition over fleet. */
export interface DriverCompanies {
  activeCompanies(
    driverId: DriverId,
    identifier: string,
  ): Promise<readonly { readonly id: CompanyId; readonly name: string }[]>;
}

/** Who is on a job right now. Supplied by composition over jobs. */
export interface ActiveJobs {
  /** The company of the job the driver is on (assigned to delivery), or `null`. Reads in the driver's own scope. */
  companyOfActiveJob(driverId: DriverId): Promise<CompanyId | null>;
  /** The drivers on a job for the company now. */
  driversOnJobs(companyId: CompanyId): Promise<readonly DriverId[]>;
}

export interface SettingsRepository {
  isEnabled(companyId: CompanyId): Promise<boolean>;
  set(companyId: CompanyId, enabled: boolean, by: StaffId, at: Date): Promise<void>;
}

export interface SharingRepository {
  isSharing(companyId: CompanyId, driverId: DriverId): Promise<boolean>;
  /** Turning on records when the driver agreed and to which wording; turning off deletes the row. */
  set(
    companyId: CompanyId,
    driverId: DriverId,
    sharing: boolean,
    wordingVersion: number,
    at: Date,
  ): Promise<void>;
}

export interface StatusRepository {
  /** Replaces the driver's status with the company. */
  upsert(status: HoursStatus): Promise<void>;
  listForCompany(companyId: CompanyId): Promise<HoursStatus[]>;
  /** Deletes the driver's status with one company, or with every company when none is named. */
  remove(driverId: DriverId, companyId?: CompanyId): Promise<void>;
  /** Deletes every status of the company, when the firm switches the feature off. */
  removeAllForCompany(companyId: CompanyId): Promise<void>;
  /** Deletes statuses last updated before `before`; says how many went. */
  deleteStale(before: Date): Promise<number>;
}
