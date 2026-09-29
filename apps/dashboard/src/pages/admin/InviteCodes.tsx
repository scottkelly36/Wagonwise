import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as inviteCodesApi from '../../api/invite-codes';
import { useStaffAuthStore } from '../../state/staff-auth-store';
import { staffErrorMessage } from '../staff/messages';

const INVITE_CODES_KEY = ['invite-codes'] as const;

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

  const error = inviteCodes.error ?? generateCode.error;
  const sorted = [...(inviteCodes.data ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div>
      <h1>Invite codes</h1>
      <p style={{ color: '#6b7280' }}>
        A tester needs one of these the first time they sign in to the driver app.
      </p>

      <button
        onClick={() => generateCode.mutate()}
        disabled={generateCode.isPending}
        style={{ marginBottom: 24 }}
      >
        {generateCode.isPending ? 'Generating…' : 'Generate code'}
      </button>

      {error !== null && <p style={{ color: '#dc2626' }}>{staffErrorMessage(error)}</p>}

      {inviteCodes.isPending ? (
        <p>Loading…</p>
      ) : sorted.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No invite codes yet.</p>
      ) : (
        <table style={{ width: '100%', textAlign: 'left' }}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((invite) => (
              <tr key={invite.code}>
                <td style={{ fontFamily: 'monospace' }}>{invite.code}</td>
                <td>
                  {invite.redeemedAt === null
                    ? 'Active'
                    : `Redeemed ${new Date(invite.redeemedAt).toLocaleDateString()}`}
                </td>
                <td>{new Date(invite.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
