import { paymentMove, type PaymentFact } from '../domain/account-rules.js';
import type { CompanyId } from '../domain/company.js';
import { deliverAccountEmail } from './account-emails.js';
import { applyMove, type AccountRuleDeps } from './run-account-rules.js';

export interface PaymentFactOutcome {
  /** The state the company was moved to, or null when nothing moved. */
  readonly moved: 'active' | 'overdue' | null;
  readonly emailed: boolean;
}

/**
 * What the payment provider has told us about a company moves it, or not (`paymentMove`): back to active when details are added or
 * everything is paid and nothing is owed, to overdue when a payment fails. The move is logged as the system's and the owner is told; the
 * company is written to ("active again", or "payment overdue"). Safe to repeat: a company that is already where the fact would put it
 * does not move, and each email is once per occasion. Runs in WagonWise staff's data scope, which the caller opens.
 */
export async function applyPaymentFact(
  deps: AccountRuleDeps,
  companyId: CompanyId,
  fact: PaymentFact,
): Promise<PaymentFactOutcome> {
  const state = await deps.states.get(companyId);
  if (state === null) return { moved: null, emailed: false };
  const settings = await deps.states.getSettings();
  const move = paymentMove(state, settings, fact);
  if (move === null) return { moved: null, emailed: false };

  await applyMove(deps, state, { type: 'move', to: move.to, note: move.note });
  const email = await deliverAccountEmail(
    deps,
    companyId,
    move.to === 'active' ? 'resumed' : 'overdue',
  );
  return { moved: move.to, emailed: email.ok && !email.value.alreadySent };
}
