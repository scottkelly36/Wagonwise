import { companyIdSchema } from '@wagonwise/contracts/companies';
import type { Privilege, StaffAccountDto } from '@wagonwise/contracts/staff';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import * as staffApi from '../../api/staff';
import { DataTable, IconButton, type Column } from '../../components/DataTable';
import { CompanySelect } from '../../components/CompanySelect';
import { FieldError } from '../../components/FieldError';
import { useCompanies } from '../../hooks/use-companies';
import { focusFirstInvalid, hasErrors, isEmail, type FieldErrors } from '../../lib/forms';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from './messages';
import { PRESET_LABELS, PRIVILEGE_LABELS, PRIVILEGE_PRESETS, PRIVILEGES } from './privileges';

/**
 * Users (P2-M1.10). A company's managers (`manage_users`) see and manage their own company's
 * users; WagonWise admins see everyone and can invite into any company, or invite more WagonWise
 * staff. The screen only offers what the signed-in person may do, but core decides: every
 * refusal comes back from it and is shown as-is.
 */
export function Users() {
  const session = useStaffAuthStore((s) => s.session);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const me = session?.staff;
  const isPlatform = me?.kind === 'platform';
  const myPrivileges: readonly Privilege[] = me?.kind === 'fleet' ? me.privileges : PRIVILEGES;
  const canManage = isPlatform || myPrivileges.includes('manage_users');

  // WagonWise admins can narrow the list to one company; a manager always sees their own.
  const [companyFilter, setCompanyFilter] = useState('');
  const listCompanyId = isPlatform
    ? companyFilter === ''
      ? undefined
      : companyFilter
    : me?.companyId;
  const companies = useCompanies(isPlatform);
  const companyNames = new Map<string, string>(
    (companies.data ?? []).map((company) => [company.id, company.name]),
  );
  const membersKey = ['staff-members', listCompanyId ?? 'everyone'] as const;

  const members = useQuery({
    queryKey: membersKey,
    queryFn: () => withAccessToken((token) => staffApi.listMembers(token, listCompanyId)),
    enabled: me !== undefined && canManage,
  });

  const refreshList = () => void queryClient.invalidateQueries({ queryKey: ['staff-members'] });

  const setPrivileges = useMutation({
    mutationFn: (input: { staffId: string; privileges: readonly Privilege[] }) =>
      withAccessToken((token) => staffApi.setPrivileges(token, input.staffId, input.privileges)),
    onSuccess: refreshList,
  });

  const remove = useMutation({
    mutationFn: (staffId: string) =>
      withAccessToken((token) => staffApi.removeMember(token, staffId)),
    onSuccess: refreshList,
  });

  if (me === undefined) return null;

  if (!canManage) {
    return (
      <div>
        <h1>Users</h1>
        <p>
          You don't have permission to manage users. Ask someone at your company with the "Manage
          users" privilege.
        </p>
      </div>
    );
  }

  const error = members.error ?? setPrivileges.error ?? remove.error;

  const columns: Column<StaffAccountDto>[] = [
    {
      key: 'name',
      header: 'Name',
      sortValue: (member) => member.name,
      cell: (member) => (
        <>
          {member.name}
          {member.id === me.id && <span className="muted"> (you)</span>}
        </>
      ),
    },
    { key: 'email', header: 'Email', sortValue: (member) => member.email, cell: (m) => m.email },
    ...(isPlatform
      ? [
          {
            key: 'account',
            header: 'Account',
            sortValue: (member: StaffAccountDto) =>
              member.kind === 'platform'
                ? 'WagonWise staff'
                : (companyNames.get(member.companyId ?? '') ?? ''),
            cell: (member: StaffAccountDto) =>
              member.kind === 'platform'
                ? 'WagonWise staff'
                : (companyNames.get(member.companyId ?? '') ?? 'A company'),
          },
        ]
      : []),
    {
      key: 'privileges',
      header: 'Privileges',
      cell: (member) => (
        <PrivilegesCell
          member={member}
          myPrivileges={myPrivileges}
          saving={setPrivileges.isPending}
          onSave={(privileges) => setPrivileges.mutate({ staffId: member.id, privileges })}
        />
      ),
    },
    {
      key: 'factor',
      header: 'Sign-in check',
      sortValue: (member) => FACTOR_LABELS[member.secondFactorMethod],
      cell: (member) => FACTOR_LABELS[member.secondFactorMethod],
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (member) =>
        member.id !== me.id && (member.kind === 'fleet' || isPlatform) ? (
          <IconButton
            icon="delete"
            danger
            label={`Remove ${member.name}`}
            onClick={() => {
              if (window.confirm(`Remove ${member.name}? They'll be signed out straight away.`)) {
                remove.mutate(member.id);
              }
            }}
          />
        ) : null,
    },
  ];

  return (
    <div>
      <h1>Users</h1>

      <InviteForm isPlatform={isPlatform} myPrivileges={myPrivileges} myCompanyId={me.companyId} />

      {isPlatform && (
        <div className="field" style={{ maxWidth: 320, marginBottom: 16 }}>
          <label htmlFor="company-filter">Show</label>
          <CompanySelect
            id="company-filter"
            value={companyFilter}
            onChange={setCompanyFilter}
            emptyLabel="Everyone, every company"
          />
        </div>
      )}

      {error !== null && <p className="error">{staffErrorMessage(error)}</p>}

      {members.isPending ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={members.data ?? []}
          rowKey={(member) => member.id}
          searchText={(member) => `${member.name} ${member.email}`}
          emptyText="No users yet."
        />
      )}
    </div>
  );
}

const FACTOR_LABELS = { totp: 'Authenticator app', sms: 'Text message', email: 'Email' } as const;

/** The privileges column: the ticks, and a Save button once something is changed. A component of
 *  its own because each row keeps its own unsaved ticks. */
function PrivilegesCell(props: {
  member: StaffAccountDto;
  myPrivileges: readonly Privilege[];
  saving: boolean;
  onSave: (privileges: readonly Privilege[]) => void;
}) {
  const { member } = props;
  const [draft, setDraft] = useState<readonly Privilege[]>(member.privileges);
  const changed =
    draft.length !== member.privileges.length || draft.some((p) => !member.privileges.includes(p));

  if (member.kind === 'platform') {
    return <span className="muted">Everything, every company</span>;
  }
  return (
    <>
      <PrivilegeChecklist value={draft} allowed={props.myPrivileges} onChange={setDraft} />
      {changed && (
        <button className="btn-primary" disabled={props.saving} onClick={() => props.onSave(draft)}>
          {props.saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </>
  );
}

/** Ticks for each privilege. The ones the signed-in person doesn't hold are shown but can't be
 *  changed: core refuses to let anyone give out more than they have. */
function PrivilegeChecklist(props: {
  value: readonly Privilege[];
  allowed: readonly Privilege[];
  onChange: (next: readonly Privilege[]) => void;
}) {
  return (
    <div>
      {PRIVILEGES.map((privilege) => (
        <label key={privilege} style={{ display: 'block', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={props.value.includes(privilege)}
            disabled={!props.allowed.includes(privilege)}
            onChange={(e) =>
              props.onChange(
                e.target.checked
                  ? [...props.value, privilege]
                  : props.value.filter((p) => p !== privilege),
              )
            }
          />{' '}
          {PRIVILEGE_LABELS[privilege]}
        </label>
      ))}
    </div>
  );
}

function InviteForm(props: {
  isPlatform: boolean;
  myPrivileges: readonly Privilege[];
  myCompanyId: string | undefined;
}) {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const [kind, setKind] = useState<'fleet' | 'platform'>('fleet');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState(props.myCompanyId ?? '');
  const [privileges, setPrivileges] = useState<readonly Privilege[]>(
    PRIVILEGE_PRESETS.viewer.filter((p) => props.myPrivileges.includes(p)),
  );
  const [link, setLink] = useState<string | undefined>(undefined);
  // The address the invitation was emailed to; undefined when it was not (so the link is shared by hand).
  const [emailedTo, setEmailedTo] = useState<string | undefined>(undefined);

  const invite = useMutation({
    mutationFn: () =>
      withAccessToken((token) =>
        staffApi.createInvite(
          token,
          kind === 'platform'
            ? { kind, name: name.trim(), email: email.trim(), privileges: [] }
            : {
                kind,
                name: name.trim(),
                email: email.trim(),
                companyId: companyIdSchema.parse(
                  props.isPlatform ? companyId.trim() : (props.myCompanyId ?? ''),
                ),
                privileges: [...privileges],
              },
        ),
      ),
    onSuccess: (result) => {
      setLink(`${window.location.origin}/join?token=${encodeURIComponent(result.inviteToken)}`);
      setEmailedTo(result.emailed ? result.invite.email : undefined);
      setName('');
      setEmail('');
      setShowErrors(false);
      void queryClient.invalidateQueries({ queryKey: ['staff-members'] });
    },
  });

  const [showErrors, setShowErrors] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const errors: FieldErrors<'name' | 'email' | 'companyId'> = {};
  if (name.trim() === '') errors.name = 'Enter their name.';
  if (email.trim() === '') errors.email = 'Enter their email address.';
  else if (!isEmail(email))
    errors.email = 'That does not look like an email address. Check it is like name@company.co.uk.';
  if (kind === 'fleet' && props.isPlatform && companyId === '') {
    errors.companyId = 'Choose the company they work for.';
  }
  const shown = (field: keyof typeof errors): string | undefined =>
    showErrors ? errors[field] : undefined;

  return (
    <section className="card" style={{ maxWidth: 560 }}>
      <h2>Invite someone</h2>
      <form
        ref={formRef}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (hasErrors(errors)) {
            setShowErrors(true);
            focusFirstInvalid(formRef.current);
            return;
          }
          setLink(undefined);
          invite.mutate();
        }}
      >
        {props.isPlatform && (
          <p>
            <label>
              <input type="radio" checked={kind === 'fleet'} onChange={() => setKind('fleet')} />{' '}
              Someone at a haulage company
            </label>{' '}
            <label>
              <input
                type="radio"
                checked={kind === 'platform'}
                onChange={() => setKind('platform')}
              />{' '}
              WagonWise staff (sees every company)
            </label>
          </p>
        )}
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="invite-name">Name</label>
          <input
            id="invite-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={shown('name') !== undefined}
            aria-describedby="invite-name-error"
          />
          <FieldError id="invite-name-error" message={shown('name')} />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="invite-email">Email</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={shown('email') !== undefined}
            aria-describedby="invite-email-error"
          />
          <FieldError id="invite-email-error" message={shown('email')} />
        </div>
        {kind === 'fleet' && props.isPlatform && (
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="invite-company">Company</label>
            <CompanySelect
              id="invite-company"
              value={companyId}
              onChange={setCompanyId}
              emptyLabel="Choose a company"
              invalid={shown('companyId') !== undefined}
              describedBy="invite-company-error"
            />
            <FieldError id="invite-company-error" message={shown('companyId')} />
          </div>
        )}
        {kind === 'fleet' && (
          <div style={{ margin: '12px 0' }}>
            <p style={{ marginBottom: 4 }}>
              Start from:{' '}
              {(Object.keys(PRIVILEGE_PRESETS) as (keyof typeof PRIVILEGE_PRESETS)[]).map(
                (preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="btn-chip"
                    onClick={() =>
                      setPrivileges(
                        PRIVILEGE_PRESETS[preset].filter((p) => props.myPrivileges.includes(p)),
                      )
                    }
                    style={{ marginRight: 6 }}
                  >
                    {PRESET_LABELS[preset]}
                  </button>
                ),
              )}
            </p>
            <PrivilegeChecklist
              value={privileges}
              allowed={props.myPrivileges}
              onChange={setPrivileges}
            />
          </div>
        )}
        <button type="submit" disabled={invite.isPending}>
          {invite.isPending ? 'Creating…' : 'Create invite link'}
        </button>
      </form>

      {invite.error !== null && <p className="error">{staffErrorMessage(invite.error)}</p>}
      {link !== undefined && (
        <div style={{ marginTop: 12 }}>
          <p>
            {emailedTo !== undefined
              ? `We have emailed an invitation to ${emailedTo}. If it does not arrive, you can send them this link yourself.`
              : "We couldn't email it, so send this link to them yourself."}{' '}
            It works once, expires in 7 days, and won't be shown again:
          </p>
          <input
            readOnly
            value={link}
            style={{ width: '100%' }}
            onFocus={(e) => e.target.select()}
          />{' '}
          <button type="button" onClick={() => void navigator.clipboard.writeText(link)}>
            Copy
          </button>
        </div>
      )}
    </section>
  );
}
