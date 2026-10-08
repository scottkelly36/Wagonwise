import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  placeholderFields,
  validateBillingDetails,
  type BillingDetails,
  type BillingField,
  type InvalidBillingDetails,
  type StaffId,
} from '../domain/billing-details.js';
import type { BillingDetailsRepository } from './ports/billing-details-repository.js';
import type { StaffCaller } from './ports/directories.js';

export type Forbidden = TaggedError<'Forbidden'>;

export interface BillingDetailsDeps {
  readonly repo: BillingDetailsRepository;
  readonly clock: Clock;
}

export interface BillingDetailsView {
  readonly details: BillingDetails;
  /** Fields still holding a [bracketed] placeholder; invoices cannot be issued until this is empty. */
  readonly placeholders: readonly BillingField[];
  readonly updatedAt: Date;
}

/** WagonWise's own details are for WagonWise admins alone: no company's staff may read or change them. */
const isAdmin = (caller: StaffCaller): boolean => caller.kind === 'platform';

export async function getBillingDetails(
  deps: Pick<BillingDetailsDeps, 'repo'>,
  caller: StaffCaller,
): Promise<Result<BillingDetailsView, Forbidden>> {
  if (!isAdmin(caller)) return err({ tag: 'Forbidden' });
  const stored = await deps.repo.get();
  return ok({
    details: stored.details,
    placeholders: placeholderFields(stored.details),
    updatedAt: stored.updatedAt,
  });
}

export async function updateBillingDetails(
  deps: BillingDetailsDeps,
  caller: StaffCaller,
  staffId: StaffId,
  input: BillingDetails,
): Promise<Result<BillingDetailsView, Forbidden | InvalidBillingDetails>> {
  if (!isAdmin(caller)) return err({ tag: 'Forbidden' });
  const valid = validateBillingDetails(input);
  if (!valid.ok) return valid;
  const at = deps.clock.now();
  await deps.repo.save(valid.value, staffId, at);
  return ok({
    details: valid.value,
    placeholders: placeholderFields(valid.value),
    updatedAt: at,
  });
}
