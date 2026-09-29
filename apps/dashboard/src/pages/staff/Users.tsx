import { companyIdSchema } from '@wagonwise/contracts/companies';
import type { Privilege, StaffAccountDto } from '@wagonwise/contracts/staff';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as staffApi from '../../api/staff';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from './messages';
import { PRESET_LABELS, PRIVILEGE_LABELS, PRIVILEGE_PRESETS, PRIVILEGES } from './privileges';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    ? UUID.test(companyFilter.trim())
      ? companyFilter.trim()
      : undefined
    : me?.companyId;
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

  return (
    <div>
      <h1>Users</h1>

      <InviteForm isPlatform={isPlatform} myPrivileges={myPrivileges} myCompanyId={me.companyId} />

      {isPlatform && (
        <p>
          <label htmlFor="company-filter">
            Show one company (company id), or leave blank for everyone:{' '}
          </label>
          <input
            id="company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            placeholder="Everyone"
            style={{ width: 320 }}
          />
        </p>
      )}

      {error !== null && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}

      {members.isPending ? (
        <p>Loading…</p>
      ) : members.data?.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No users yet.</p>
      ) : (
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              {isPlatform && <th>Account</th>}
              <th>Privileges</th>
              <th>Sign-in check</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.data?.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isSelf={member.id === me.id}
                isPlatform={isPlatform}
                myPrivileges={myPrivileges}
                saving={setPrivileges.isPending}
                onSave={(privileges) => setPrivileges.mutate({ staffId: member.id, privileges })}
                onRemove={() => {
                  if (
                    window.confirm(`Remove ${member.name}? They'll be signed out straight away.`)
                  ) {
                    remove.mutate(member.id);
                  }
                }}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const FACTOR_LABELS = { totp: 'Authenticator app', sms: 'Text message', email: 'Email' } as const;

function MemberRow(props: {
  member: StaffAccountDto;
  isSelf: boolean;
  isPlatform: boolean;
  myPrivileges: readonly Privilege[];
  saving: boolean;
  onSave: (privileges: readonly Privilege[]) => void;
  onRemove: () => void;
}) {
  const { member } = props;
  const [draft, setDraft] = useState<readonly Privilege[]>(member.privileges);
  const changed =
    draft.length !== member.privileges.length || draft.some((p) => !member.privileges.includes(p));

  return (
    <tr style={{ borderTop: '1px solid #e5e7eb', verticalAlign: 'top' }}>
      <td>
        {member.name}
        {props.isSelf && <span style={{ color: '#6b7280' }}> (you)</span>}
      </td>
      <td>{member.email}</td>
      {props.isPlatform && (
        <td>
          {member.kind === 'platform' ? 'WagonWise staff' : `Company ${member.companyId ?? ''}`}
        </td>
      )}
      <td>
        {member.kind === 'platform' ? (
          <span style={{ color: '#6b7280' }}>Everything, every company</span>
        ) : (
          <>
            <PrivilegeChecklist value={draft} allowed={props.myPrivileges} onChange={setDraft} />
            {changed && (
              <button disabled={props.saving} onClick={() => props.onSave(draft)}>
                {props.saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </>
        )}
      </td>
      <td>{FACTOR_LABELS[member.secondFactorMethod]}</td>
      <td>
        {!props.isSelf && (member.kind === 'fleet' || props.isPlatform) && (
          <button onClick={props.onRemove}>Remove</button>
        )}
      </td>
    </tr>
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
      setName('');
      setEmail('');
      void queryClient.invalidateQueries({ queryKey: ['staff-members'] });
    },
  });

  const ready =
    name.trim() !== '' &&
    email.includes('@') &&
    (kind === 'platform' || !props.isPlatform || UUID.test(companyId.trim()));

  return (
    <section style={{ border: '1px solid #e5e7eb', padding: 16, marginBottom: 24, maxWidth: 560 }}>
      <h2 style={{ marginTop: 0 }}>Invite someone</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
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
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />{' '}
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {kind === 'fleet' && props.isPlatform && (
          <p>
            <input
              placeholder="Company id"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              style={{ width: 320 }}
            />
          </p>
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
        <button type="submit" disabled={invite.isPending || !ready}>
          {invite.isPending ? 'Creating…' : 'Create invite link'}
        </button>
      </form>

      {invite.error !== null && (
        <p style={{ color: '#dc2626' }}>{staffErrorMessage(invite.error)}</p>
      )}
      {link !== undefined && (
        <div style={{ marginTop: 12 }}>
          <p>Send this link to them. It works once, expires in 7 days, and won't be shown again:</p>
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
