import { makeId } from '../../../shared/brand.js';
import { err, ok, type Result, type TaggedError } from '../../../shared/result.js';
import { PRIVILEGES, actorFor } from '../domain/staff-account.js';
import type { Forbidden } from '../domain/staff-policy.js';
import { createCompany, type CreateCompanyDeps } from './create-company.js';
import { createStaffInvite } from './create-staff-invite.js';
import type { StaffDeps } from './staff-deps.js';

export type EmailAlreadyInUse = TaggedError<'EmailAlreadyInUse'>;

export interface StartedTrialFirm {
  readonly companyId: string;
  /** Whether the email with the join link went. */
  readonly emailed: boolean;
  /** The link's secret, for the owner to send by hand when it was not emailed. */
  readonly inviteToken: string;
}

/**
 * WagonWise staff turn a firm that registered on the website into a company on a free trial (the length in the owner's settings,
 * from `createCompany`) and invite its first person as the company's manager, holding every privilege, by the same invitation a
 * firm's own manager sends (a link, then a password and a second factor). Everything happens in the caller's scope, which must
 * be WagonWise staff's, so it is one transaction: a company is never left without the invitation. Refused, before anything is
 * made, when the address already has an account, so pressing the button twice cannot make two firms.
 */
export async function startTrialFirm(
  deps: { readonly company: CreateCompanyDeps; readonly staff: StaffDeps },
  input: {
    readonly staffId: string;
    readonly firmName: string;
    readonly contactName: string;
    readonly contactEmail: string;
  },
): Promise<Result<StartedTrialFirm, Forbidden | EmailAlreadyInUse>> {
  const staff = await deps.staff.accounts.findById(makeId<'StaffId'>(input.staffId));
  if (staff === null || staff.kind !== 'platform') return err({ tag: 'Forbidden' });
  if ((await deps.staff.accounts.findByEmail(input.contactEmail)) !== null) {
    return err({ tag: 'EmailAlreadyInUse' });
  }
  // The platform check was made just above, in this scope: the usual admin lookup opens a scope of its own, and scopes cannot nest.
  const company = await createCompany(
    { ...deps.company, admins: { isAdmin: () => Promise.resolve(true) } },
    {
      callerId: staff.id,
      id: makeId<'CompanyId'>(deps.staff.ids.newId()),
      name: input.firmName,
    },
  );
  if (!company.ok) return company;
  const invite = await createStaffInvite(deps.staff, actorFor(staff), {
    kind: 'fleet',
    email: input.contactEmail,
    name: input.contactName,
    companyId: company.value.id,
    privileges: PRIVILEGES,
  });
  // Not expected (the caller is a WagonWise admin and the address was checked), but never leave a company with no way in.
  if (!invite.ok) throw new Error(`could not invite the first person: ${invite.error.tag}`);
  return ok({
    companyId: company.value.id,
    emailed: invite.value.emailed,
    inviteToken: invite.value.token,
  });
}
