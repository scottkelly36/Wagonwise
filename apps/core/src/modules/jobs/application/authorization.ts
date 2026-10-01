import type { CompanyId } from '../domain/job.js';
import type { Caller } from './ports/caller-directory.js';

/** WagonWise admins create jobs for any company. A company's staff need the `dispatch` privilege
 *  (companies/domain/staff-account.ts's PRIVILEGES) for their own company only. */
export function canCreateJob(caller: Caller, companyId: CompanyId): boolean {
  return (
    caller.kind === 'platform' ||
    (caller.companyId === companyId && caller.privileges.includes('dispatch'))
  );
}
