import type { AccountEmailKind } from '../../domain/account-emails.js';
import type { CompanyId } from '../../domain/company.js';

/**
 * Which account emails have gone to which company, so none goes twice for the same occasion. `periodKey` is the day the occasion
 * began: the day the free period ends, or the UK day the company went overdue or was paused.
 */
export interface AccountEmailLog {
  /** Writes the row first. False when the row is already there: that email has been sent (or is being sent) already. */
  claim(
    companyId: CompanyId,
    kind: AccountEmailKind,
    periodKey: string,
    at: Date,
  ): Promise<boolean>;
  /** The email did not go out: give the row back so the next pass tries again. */
  release(companyId: CompanyId, kind: AccountEmailKind, periodKey: string): Promise<void>;
  /** Once it has gone: how many people it went to. */
  recordSent(
    companyId: CompanyId,
    kind: AccountEmailKind,
    periodKey: string,
    recipients: number,
  ): Promise<void>;
}

/** Sends one email, through identity's sender (the same account that carries sign-in codes). */
export interface AccountMailer {
  send(to: string, subject: string, text: string): Promise<void>;
}

/** A line to the owner (the alert address) that WagonWise has written to a company. Absent when no alert address is set. */
export interface OwnerNotice {
  send(subject: string, text: string): Promise<void>;
}
