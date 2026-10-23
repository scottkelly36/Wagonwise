import type { InviteCodeDto } from '@wagonwise/contracts/identity';
import { MAX_INVITE_CODES_AT_ONCE } from '@wagonwise/contracts/identity';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import * as inviteCodesApi from '../../api/invite-codes';
import { DataTable, type Column } from '../../components/DataTable';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const INVITE_CODES_KEY = ['invite-codes'] as const;

const COLUMNS: Column<InviteCodeDto>[] = [
  {
    key: 'code',
    header: 'Code',
    sortValue: (invite) => invite.code,
    cell: (invite) => <span style={{ fontFamily: 'monospace' }}>{invite.code}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    sortValue: (invite) => (invite.redeemedAt === null ? 'Active' : 'Redeemed'),
    cell: (invite) =>
      invite.redeemedAt === null
        ? 'Active'
        : `Redeemed ${new Date(invite.redeemedAt).toLocaleDateString('en-GB')}`,
  },
  {
    key: 'created',
    header: 'Created',
    sortValue: (invite) => invite.createdAt,
    cell: (invite) => new Date(invite.createdAt).toLocaleDateString('en-GB'),
  },
];

/** Replaces the manual `insert into identity.invite_codes` the README used to point testers at
 *  (2026-09-27) — see core's `application/create-invite-code.ts` for the full reasoning. */
export function InviteCodes() {
  const withAccessToken = useStaffAuthStore((s) => s.withAccessToken);
  const queryClient = useQueryClient();

  const inviteCodes = useQuery({
    queryKey: INVITE_CODES_KEY,
    queryFn: () => withAccessToken((token) => inviteCodesApi.listInviteCodes(token)),
  });

  const generateCode = useMutation({
    mutationFn: () => withAccessToken((token) => inviteCodesApi.createInviteCode(token)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: INVITE_CODES_KEY }),
  });

  // Several at once for a group of testers: the new codes are listed in a box, one a line, to copy.
  const [howMany, setHowMany] = useState(20);
  const generateMany = useMutation({
    mutationFn: () => withAccessToken((token) => inviteCodesApi.createInviteCodes(token, howMany)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: INVITE_CODES_KEY }),
  });
  const newCodes = generateMany.data?.map((invite) => invite.code).join('\n');

  const error = inviteCodes.error ?? generateCode.error ?? generateMany.error;
  const sorted = [...(inviteCodes.data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div>
      <h1>Invite codes</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        A tester needs one of these the first time they sign in to the driver app.
      </p>

      <button
        className="btn-primary"
        onClick={() => generateCode.mutate()}
        disabled={generateCode.isPending}
        style={{ marginBottom: 24 }}
      >
        {generateCode.isPending ? 'Generating…' : 'Generate code'}
      </button>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <label>
          Make{' '}
          <input
            type="number"
            min={1}
            max={MAX_INVITE_CODES_AT_ONCE}
            value={howMany}
            onChange={(e) =>
              setHowMany(
                Math.max(1, Math.min(MAX_INVITE_CODES_AT_ONCE, Number(e.target.value) || 1)),
              )
            }
            style={{ width: 70 }}
            aria-label="How many codes"
          />{' '}
          codes at once
        </label>
        <button onClick={() => generateMany.mutate()} disabled={generateMany.isPending}>
          {generateMany.isPending ? 'Generating…' : `Generate ${howMany}`}
        </button>
      </div>
      {newCodes !== undefined && (
        <div style={{ marginBottom: 24 }}>
          <p style={{ margin: '0 0 4px' }}>
            The new codes, one a line. Each works once, so give each tester their own.
          </p>
          <textarea
            readOnly
            value={newCodes}
            rows={Math.min(12, generateMany.data?.length ?? 1)}
            style={{ width: 260, fontFamily: 'monospace' }}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="The new invite codes"
          />
        </div>
      )}

      {error !== null && <p style={{ color: 'var(--danger)' }}>{staffErrorMessage(error)}</p>}

      {inviteCodes.isPending ? (
        <p>Loading…</p>
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={sorted}
          rowKey={(invite) => invite.code}
          searchText={(invite) => invite.code}
          emptyText="No invite codes yet."
        />
      )}
    </div>
  );
}
