import type { Id } from '../../../shared/brand.js';

export type DriverId = Id<'DriverId'>;

/** A signed-in tester. Phase 1 has no profile beyond the identifier they signed in with. */
export interface Driver {
  readonly id: DriverId;
  /** Already normalised by normalizeIdentifier() before a Driver is ever constructed. */
  readonly identifier: string;
  readonly createdAt: Date;
}
