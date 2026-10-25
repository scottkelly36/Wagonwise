import type {
  CompanyId,
  DriverId,
  GeoPoint,
  SosAlert,
  SosAlertId,
  SosStatus,
  StaffId,
} from '../domain/sos.js';

/** Who a signed-in staff account is, as far as SOS cares. */
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

/** A driver's sign-in, for the `driver` data scope. Supplied by composition over identity. */
export interface DriverIdentityDirectory {
  getIdentifier(driverId: DriverId): Promise<string | null>;
}

/** Who a driver is and which companies an SOS from them goes to, as of now. */
export interface DriverSituation {
  readonly name: string | undefined;
  /** How to ring them: the number or email they sign in with. */
  readonly contact: string | undefined;
  /** Empty for a driver with no company: nothing is sent. */
  readonly companies: readonly {
    readonly id: CompanyId;
    readonly name: string;
    readonly vehicle?:
      { readonly name: string; readonly registration?: string | undefined } | undefined;
    readonly jobReference?: string | undefined;
  }[];
}

/**
 * Supplied by composition over identity, fleet and jobs (AGENTS.md rule 7). A driver on a job tells that job's company, with the
 * vehicle and the job; otherwise every company they are an active member of. Reads in the driver's own data scope.
 */
export interface DriverSituations {
  forDriver(driverId: DriverId, identifier: string): Promise<DriverSituation>;
}

/** A person at a company who can be emailed about an SOS. Supplied by composition over companies. */
export interface OfficeContact {
  readonly name: string;
  readonly email: string;
  readonly privileges: readonly string[];
}

export interface OfficeContacts {
  /** The company's fleet accounts. Opens its own data scope, so call it outside any other one. */
  forCompany(companyId: CompanyId): Promise<readonly OfficeContact[]>;
}

/** Sends a plain-text email. Supplied by composition over identity's `sendEmail`. */
export interface Mailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

/** The three words for a position, or `undefined` when they are not available. Supplied by composition over what3words. */
export interface WordsFor {
  wordsFor(
    point: GeoPoint,
  ): Promise<{ words: string; nearestPlace: string | undefined } | undefined>;
}

export interface SosRepository {
  /** Stores the alerts; one already stored for the same request and company is left as it is. */
  insertAll(alerts: readonly SosAlert[]): Promise<void>;
  /** The alerts one driver's press made. */
  findByRequest(requestId: string, driverId: DriverId): Promise<SosAlert[]>;
  /** The company's alerts, newest first: the open ones, or all, at most `limit`. */
  listForCompany(companyId: CompanyId, status: 'open' | 'all', limit: number): Promise<SosAlert[]>;
  findById(id: SosAlertId): Promise<SosAlert | null>;
  /** Marks an open alert dealt with by someone in the office. */
  resolve(id: SosAlertId, by: StaffId, at: Date): Promise<void>;
  /** Cancels the driver's still-open alerts for the press; says which, as they now are. */
  cancelRequest(requestId: string, driverId: DriverId, at: Date): Promise<SosAlert[]>;
  /** Deletes resolved and cancelled alerts last changed before `cutoff`; says how many. Open ones are kept. */
  deleteClosedBefore(cutoff: Date): Promise<number>;
  /** Deletes everything about a driver (account deletion). Safe to run twice. */
  eraseDriver(driverId: DriverId): Promise<void>;
}

export type { SosStatus };
