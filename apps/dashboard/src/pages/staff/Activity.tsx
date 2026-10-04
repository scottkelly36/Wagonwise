import type { Privilege, StaffAuditEntryDto } from '@wagonwise/contracts/staff';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import * as staffApi from '../../api/staff';
import { DataTable, type Column } from '../../components/DataTable';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from './messages';
import { PRIVILEGE_LABELS } from './privileges';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function privilegeList(value: string | readonly string[] | undefined): string {
  const list = typeof value === 'string' ? [value] : (value ?? []);
  return list.length === 0
    ? 'nothing'
    : list.map((p) => PRIVILEGE_LABELS[p as Privilege] ?? p).join(', ');
}

/** One line of plain English per entry. `who` turns an account id into a name. */
function describe(entry: StaffAuditEntryDto, who: (id: string | undefined) => string): string {
  const d = entry.details;
  switch (entry.action) {
    case 'invite_created':
      return `${who(entry.actorId)} invited ${String(d.email)}${
        d.kind === 'platform' ? ' as WagonWise staff' : ` (${privilegeList(d.privileges)})`
      }`;
    case 'staff_joined':
      return `${who(entry.targetId)} joined`;
    case 'signed_in':
      return d.method === 'recovery_code'
        ? `${who(entry.targetId)} signed in with a recovery code`
        : `${who(entry.targetId)} signed in`;
    case 'sign_in_failed':
      return `Wrong password for ${who(entry.targetId)}`;
    case 'second_factor_failed':
      return `Wrong sign-in code for ${who(entry.targetId)}`;
    case 'privileges_changed':
      return `${who(entry.actorId)} changed ${who(entry.targetId)}'s privileges from ${privilegeList(
        d.before,
      )} to ${privilegeList(d.after)}`;
    case 'staff_removed':
      return `${who(entry.actorId)} removed ${String(d.email)}`;
  }
}

const WARNING_ACTIONS = new Set(['sign_in_failed', 'second_factor_failed']);

/**
 * Activity (P2-M1.11): the staff audit log, newest first. Same visibility as Users: a company's
 * managers see their own company; WagonWise admins see everything, or one company.
 */
export function Activity() {
  const session = useStaffAuthStore((s) => s.session);
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const me = session?.staff;
  const isPlatform = me?.kind === 'platform';
  const canView = isPlatform || (me?.kind === 'fleet' && me.privileges.includes('manage_users'));

  const [companyFilter, setCompanyFilter] = useState('');
  const companyId = isPlatform
    ? UUID.test(companyFilter.trim())
      ? companyFilter.trim()
      : undefined
    : me?.companyId;

  const entries = useQuery({
    queryKey: ['staff-audit', companyId ?? 'everyone'],
    queryFn: () => withAccessToken((token) => staffApi.listAudit(token, companyId)),
    enabled: canView,
  });
  // Names for the ids in the log. Removed people drop out of this list; they show as "someone".
  const members = useQuery({
    queryKey: ['staff-members', companyId ?? 'everyone'],
    queryFn: () => withAccessToken((token) => staffApi.listMembers(token, companyId)),
    enabled: canView,
  });

  if (me === undefined) return null;
  if (!canView) {
    return (
      <div>
        <h1>Activity</h1>
        <p>You don't have permission to see your company's activity.</p>
      </div>
    );
  }

  const names = new Map<string, string>((members.data ?? []).map((m) => [m.id, m.name]));
  const who = (id: string | undefined) =>
    id === undefined ? 'Someone' : id === me.id ? 'You' : (names.get(id) ?? 'Someone');

  const columns: Column<StaffAuditEntryDto>[] = [
    {
      key: 'when',
      header: 'When',
      sortValue: (entry) => entry.at,
      cell: (entry) => new Date(entry.at).toLocaleString('en-GB'),
    },
    {
      key: 'what',
      header: 'What happened',
      cell: (entry) => (
        <span style={{ color: WARNING_ACTIONS.has(entry.action) ? '#b45309' : undefined }}>
          {describe(entry, who)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <h1>Activity</h1>
      <p style={{ color: '#6b7280' }}>
        Sign-ins, invites and every change to who can do what. The latest 200 entries.
      </p>

      {isPlatform && (
        <p>
          <label htmlFor="company-filter">
            One company (company id), or blank for everything:{' '}
          </label>
          <input
            id="company-filter"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            placeholder="Everything"
            style={{ width: 320 }}
          />
        </p>
      )}

      {entries.error !== null && (
        <p style={{ color: '#dc2626' }}>{staffErrorMessage(entries.error)}</p>
      )}

      {entries.isPending ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={columns}
          rows={entries.data ?? []}
          rowKey={(entry) => entry.id}
          searchText={(entry) => describe(entry, who)}
          emptyText="Nothing yet."
        />
      )}
    </div>
  );
}
