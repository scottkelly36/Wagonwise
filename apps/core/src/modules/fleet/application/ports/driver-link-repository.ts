import type { DomainEvent } from '../../../../shared/domain-event.js';
import type { DriverId, DriverLink, DriverLinkId } from '../../domain/driver-link.js';
import type { CompanyId } from '../../domain/vehicle.js';

export interface DriverLinkRepository {
  findById(id: DriverLinkId): Promise<DriverLink | null>;
  /** The driver's invited, requested or active link with the company, if any. */
  findLive(companyId: CompanyId, driverId: DriverId): Promise<DriverLink | null>;
  /** Whether the driver is an active (not merely invited or requested) member of the company —
   *  P2-M2.8: what `jobs` checks before assigning them a job, replacing identity's old single
   *  `drivers.company_id`. */
  isActive(companyId: CompanyId, driverId: DriverId): Promise<boolean>;
  /** A pending invitation from the company to this (normalised) identifier, if any. */
  findPendingInvite(companyId: CompanyId, identifier: string): Promise<DriverLink | null>;
  /** Newest first. */
  listForCompany(companyId: CompanyId): Promise<DriverLink[]>;
  /** The driver's own links, plus pending invitations made for their (normalised) identifier. */
  listForDriver(driverId: DriverId, identifier: string): Promise<DriverLink[]>;
  /** `events` are written to the outbox together with the link. */
  save(link: DriverLink, events?: readonly DomainEvent[]): Promise<void>;
}
