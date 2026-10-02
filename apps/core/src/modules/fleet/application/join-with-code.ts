import { makeId } from '../../../shared/brand.js';
import type { Clock } from '../../../shared/ports/clock.js';
import type { IdGenerator } from '../../../shared/ports/id-generator.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { isWellFormedCode, normalizeCode } from '../domain/company-code.js';
import { requestToJoin, type DriverLink } from '../domain/driver-link.js';
import type { DriverActor } from './driver-actor.js';
import type { AlreadyLinked, InvalidCode } from './errors.js';
import type { CompanyCodeRepository } from './ports/company-code-repository.js';
import type { DriverLinkRepository } from './ports/driver-link-repository.js';

export interface JoinWithCodeDeps {
  readonly links: Pick<DriverLinkRepository, 'findLive' | 'findPendingInvite' | 'save'>;
  readonly codes: Pick<CompanyCodeRepository, 'findCompanyByCode'>;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}

export type JoinWithCodeError = InvalidCode | AlreadyLinked;

/** A driver asks to join with a company's code. This only makes a request: nothing is granted
 *  until the company approves it. A malformed code and an unknown one get the same answer. */
export async function joinWithCode(
  deps: JoinWithCodeDeps,
  input: { readonly actor: DriverActor; readonly code: string },
): Promise<Result<DriverLink, JoinWithCodeError>> {
  const code = normalizeCode(input.code);
  if (!isWellFormedCode(code)) return err({ tag: 'InvalidCode' });
  const companyId = await deps.codes.findCompanyByCode(code);
  if (companyId === null) return err({ tag: 'InvalidCode' });

  const { driverId, identifier } = input.actor;
  const already =
    (await deps.links.findLive(companyId, driverId)) ??
    (await deps.links.findPendingInvite(companyId, identifier));
  if (already !== null) return err({ tag: 'AlreadyLinked' });

  const link = requestToJoin(
    makeId<'DriverLinkId'>(deps.ids.newId()),
    companyId,
    driverId,
    deps.clock.now(),
  );
  await deps.links.save(link);
  return ok(link);
}
