import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import {
  MAX_PHOTO_RETENTION_MONTHS,
  MIN_PHOTO_RETENTION_MONTHS,
  type CompanyId,
} from '../domain/company.js';
import type { Actor } from '../domain/staff-account.js';
import { can, type Forbidden } from '../domain/staff-policy.js';
import { audit } from './audit.js';
import type { StaffDeps } from './staff-deps.js';

export type CompanyNotFound = TaggedError<'CompanyNotFound'>;
export type InvalidSetting = TaggedError<'InvalidSetting'>;

export interface CompanySettings {
  readonly photoRetentionMonths: number;
}

/** Anyone signed in to the company can read its settings (so the page can say what is in force); WagonWise staff
 *  can read any company's. */
export async function getCompanySettings(
  deps: Pick<StaffDeps, 'companies'>,
  actor: Actor,
  companyId: CompanyId,
): Promise<Result<CompanySettings, Forbidden | CompanyNotFound>> {
  if (actor.kind === 'fleet' && actor.companyId !== companyId) return err({ tag: 'Forbidden' });
  const company = await deps.companies.findById(companyId);
  if (company === null) return err({ tag: 'CompanyNotFound' });
  return ok({ photoRetentionMonths: company.photoRetentionMonths });
}

/**
 * How long this company's proof-of-delivery photos are kept. The company chooses, because it is the controller of
 * its delivery records and WagonWise deletes on its instruction (a daily task in core). Needs `manage_users`
 * (the company's managers) or WagonWise staff, and is written to the audit log.
 */
export async function updateCompanySettings(
  deps: Pick<StaffDeps, 'companies' | 'auditLog' | 'clock' | 'ids'>,
  actor: Actor,
  companyId: CompanyId,
  settings: CompanySettings,
): Promise<Result<CompanySettings, Forbidden | CompanyNotFound | InvalidSetting>> {
  if (!can(actor, 'manage_users', companyId)) return err({ tag: 'Forbidden' });
  const months = settings.photoRetentionMonths;
  if (
    !Number.isInteger(months) ||
    months < MIN_PHOTO_RETENTION_MONTHS ||
    months > MAX_PHOTO_RETENTION_MONTHS
  ) {
    return err({ tag: 'InvalidSetting' });
  }
  const company = await deps.companies.findById(companyId);
  if (company === null) return err({ tag: 'CompanyNotFound' });
  await deps.companies.setPhotoRetention(companyId, months);
  await audit(deps, {
    action: 'company_settings_changed',
    actorId: makeId<'StaffId'>(actor.staffId),
    companyId,
    details: {
      photoRetentionMonthsBefore: String(company.photoRetentionMonths),
      photoRetentionMonthsAfter: String(months),
    },
  });
  return ok({ photoRetentionMonths: months });
}
