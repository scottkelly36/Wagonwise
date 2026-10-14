import { err, ok, type Result } from '../../../shared/result.js';
import {
  normalizeLabel,
  withLabel,
  type DriverLink,
  type DriverLinkId,
  type InvalidLabel,
} from '../domain/driver-link.js';
import { canManageFleet, canViewFleet } from './authorization.js';
import type { Forbidden, LinkNotFound } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { DriverLinkRepository } from './ports/driver-link-repository.js';

export interface SetDriverLinkLabelDeps {
  readonly links: Pick<DriverLinkRepository, 'findById' | 'save'>;
}

export type SetDriverLinkLabelError = LinkNotFound | Forbidden | InvalidLabel;

/**
 * The company gives a driver a label (or clears it), so its staff can tell drivers apart whatever the driver has
 * called themselves. Needs `manage_fleet`; a link in a company the caller cannot see is "not found", as for settling.
 */
export async function setDriverLinkLabel(
  deps: SetDriverLinkLabelDeps,
  input: { readonly caller: Caller; readonly linkId: DriverLinkId; readonly label: string },
): Promise<Result<DriverLink, SetDriverLinkLabelError>> {
  const link = await deps.links.findById(input.linkId);
  if (link === null || !canViewFleet(input.caller, link.companyId)) {
    return err({ tag: 'LinkNotFound' });
  }
  if (!canManageFleet(input.caller, link.companyId)) return err({ tag: 'Forbidden' });
  const label = normalizeLabel(input.label);
  if (!label.ok) return label;
  const labelled = withLabel(link, label.value);
  await deps.links.save(labelled);
  return ok(labelled);
}
