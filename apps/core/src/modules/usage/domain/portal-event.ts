import type { PortalEventDto } from '@wagonwise/contracts/usage';

/**
 * One thing a company's staff did in the portal: a page opened, or a step of a form (docs/company-account-states-scope.md, "Portal
 * tracking"). The company is kept; the person is not. Never a value anyone typed: only names from the contract's fixed lists.
 */
export interface PortalEvent {
  readonly id: string;
  readonly companyId: string;
  readonly sessionId: string;
  readonly event: PortalEventDto['event'];
  readonly page?: string | undefined;
  readonly form?: string | undefined;
  readonly field?: string | undefined;
  readonly problem?: string | undefined;
  readonly at: Date;
}

/** Kept no longer than this, the same as the app's flow events. */
export const PORTAL_EVENT_RETENTION_DAYS = 90;
