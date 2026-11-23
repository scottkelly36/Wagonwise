import { err, ok, type Result } from '../../../shared/result.js';
import type { AccountStateMove } from '../domain/account-state.js';
import type { CompanyId } from '../domain/company.js';
import type { Actor } from '../domain/staff-account.js';
import type { Forbidden } from '../domain/staff-policy.js';
import type { AccountEmailLog, AccountEmailRecord } from './ports/account-emails.js';
import type { AccountStateRepository } from './ports/account-state-repository.js';

export interface AccountHistory {
  readonly moves: readonly AccountStateMove[];
  readonly emails: readonly AccountEmailRecord[];
}

/** How much of each list WagonWise staff are shown. */
export const HISTORY_LIMIT = 20;

/**
 * What has happened to a company's account: the latest moves between states (by a person, or automatically) and the latest emails sent
 * to it, newest first. WagonWise staff only: a company never reads how it was moved or chased.
 */
export async function getAccountHistory(
  deps: {
    readonly states: Pick<AccountStateRepository, 'listMoves'>;
    readonly emailLog: Pick<AccountEmailLog, 'list'>;
  },
  actor: Actor,
  companyId: CompanyId,
): Promise<Result<AccountHistory, Forbidden>> {
  if (actor.kind !== 'platform') return err({ tag: 'Forbidden' });
  const [moves, emails] = await Promise.all([
    deps.states.listMoves(companyId, HISTORY_LIMIT),
    deps.emailLog.list(companyId, HISTORY_LIMIT),
  ]);
  return ok({ moves, emails });
}
