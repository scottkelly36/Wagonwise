import type {
  CompanyId,
  DriverId,
  FileSummary,
  FirmSettings,
  NewFile,
  StaffId,
  StoredFile,
} from '../domain/tachograph.js';

/** Who a signed-in staff account is, as far as tachograph files care. */
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

/** Who and what belongs to a company. Supplied by composition over fleet. Reads in the caller's own data scope. */
export interface CompanyRoster {
  isActiveDriver(companyId: CompanyId, driverId: string): Promise<boolean>;
  hasVehicle(companyId: CompanyId, vehicleId: string): Promise<boolean>;
}

/** Whether a company's account is paused. Supplied by composition over `companies`. A paused firm takes nothing from drivers. */
export interface CompanyAccounts {
  /** The company's name when it is paused, else `null`. */
  pausedCompanyName(companyId: CompanyId): Promise<string | null>;
}

export interface SettingsRepository {
  get(companyId: CompanyId): Promise<FirmSettings>;
  set(companyId: CompanyId, settings: FirmSettings, by: StaffId, at: Date): Promise<void>;
}

export interface FileRepository {
  /** `duplicate` when the company already holds exactly these bytes (nothing is changed). */
  add(file: NewFile): Promise<'added' | 'duplicate'>;
  /** The newest file for each driver card and each vehicle unit of the company. */
  latestPerSubject(companyId: CompanyId): Promise<FileSummary[]>;
  /** The company's newest files of all, newest first. */
  recent(companyId: CompanyId, limit: number): Promise<FileSummary[]>;
  find(companyId: CompanyId, fileId: string): Promise<StoredFile | null>;
  remove(companyId: CompanyId, fileId: string): Promise<boolean>;
  /** The day of the driver's newest card file held by the company. Reads in the driver's own scope. */
  latestCardDay(companyId: CompanyId, driverId: DriverId): Promise<string | undefined>;
  /** Deletes files older than each company's retention (12 months unless the firm chose longer); says how many went. */
  deleteExpired(now: Date): Promise<number>;
}
