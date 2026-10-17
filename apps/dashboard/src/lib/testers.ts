import type { SendInvitesResponse, TesterDto } from '@wagonwise/contracts/signups';

import { csvCell } from './job-report';

const ROLE_LABELS: Record<string, string> = {
  driver: 'Driver',
  company: 'Company',
  both: 'Driver and company',
  other: 'Other',
};

export const roleLabel = (role: string): string => ROLE_LABELS[role] ?? role;

/** The list as a spreadsheet file, for mailing the testers from your own mail tool. */
export function testersCsv(testers: readonly TesterDto[]): string {
  const lines = [
    ['Email', 'Name', 'Role', 'Company', 'Fleet size', 'Signed up', 'Invited', 'Invite code']
      .map(csvCell)
      .join(','),
    ...testers.map((t) =>
      [
        t.email,
        t.name ?? '',
        roleLabel(t.role),
        t.company ?? '',
        t.fleetSize ?? '',
        t.createdAt,
        t.invitedAt ?? '',
        t.inviteCode ?? '',
      ]
        .map(csvCell)
        .join(','),
    ),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** What happened when invites were sent, in a sentence: "3 invites sent. 1 could not be sent, so try it again." */
export function inviteSummary(results: SendInvitesResponse['results']): string {
  const count = (status: string) => results.filter((r) => r.status === status).length;
  const sent = count('sent');
  const failed = count('failed');
  const skipped = count('already_invited') + count('not_found');
  const parts = [`${sent} ${sent === 1 ? 'invite' : 'invites'} sent.`];
  if (failed > 0) parts.push(`${failed} could not be sent, so try again.`);
  if (skipped > 0) parts.push(`${skipped} left out (already invited, or no longer on the list).`);
  return parts.join(' ');
}

/** Only people not yet sent an invite can be picked to be sent one. */
export const canInvite = (t: TesterDto): boolean => t.invitedAt === undefined;

/**
 * The addresses in the plain form Google Play's tester list upload takes: one address per line, no header, no commas and no
 * byte-order mark (Play refuses a file that starts with one, and a header line is read as an address). Each address once.
 */
export function playTesterEmailsCsv(testers: readonly Pick<TesterDto, 'email'>[]): string {
  const emails = [...new Set(testers.map((t) => t.email.trim().toLowerCase()))].filter(
    (email) => email !== '',
  );
  return emails.join('\r\n') + (emails.length === 0 ? '' : '\r\n');
}
