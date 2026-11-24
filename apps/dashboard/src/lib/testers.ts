import type {
  SendInvitesResponse,
  SendLaunchEmailsResponse,
  TesterDto,
  StartTrialResponse,
} from '@wagonwise/contracts/signups';

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

/** What happened when the "out now" emails were sent, in a sentence: "3 emails sent. 1 could not be sent, so try again." */
export function launchEmailSummary(results: SendLaunchEmailsResponse['results']): string {
  const count = (status: string) => results.filter((r) => r.status === status).length;
  const sent = count('sent');
  const failed = count('failed');
  const skipped = count('already_sent') + count('not_found');
  const parts = [`${sent} ${sent === 1 ? 'email' : 'emails'} sent.`];
  if (failed > 0) parts.push(`${failed} could not be sent, so try again.`);
  if (skipped > 0) parts.push(`${skipped} left out (already sent, or no longer on the list).`);
  return parts.join(' ');
}

/** Only people not yet sent the "out now" email can be sent it. */
export const canLaunchEmail = (t: TesterDto): boolean => t.launchEmailedAt === undefined;

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

/** A firm can be given a trial once, and a driver's sign-up is not a firm. */
export const canStartTrial = (t: TesterDto): boolean =>
  t.trialStartedAt === undefined && t.role !== 'driver';

/**
 * What happened when a trial was started, in a sentence or two. When the email could not be sent, the join link is given so it can be
 * sent by hand (`origin` is where the portal is served).
 */
function vehicleRoom(vehicles: number | undefined): string {
  if (vehicles === undefined) return '';
  return vehicles > 0
    ? `Their plan has room for ${vehicles} vehicles (change it on the Plans page).`
    : 'Their plan has no room for vehicles yet: set it on the Plans page, or they cannot add one.';
}

export function startTrialSummary(
  response: StartTrialResponse,
  email: string,
  origin: string,
): string {
  switch (response.status) {
    case 'started':
      return (
        response.emailed === false && response.inviteToken !== undefined
          ? `The trial is made, but the email to ${email} could not be sent. Send them this link yourself (it works once, for a week): ${origin}/join?token=${encodeURIComponent(response.inviteToken)} ${vehicleRoom(response.vehicles)}`
          : `The trial is made and ${email} has been emailed a link to set up their sign-in. ${vehicleRoom(response.vehicles)}`
      ).trim();
    case 'already_started':
      return 'A trial was already started from this sign-up.';
    case 'email_in_use':
      return `${email} already has a WagonWise account, so no firm was made.`;
    case 'not_a_firm':
      return 'That sign-up is a driver, not a firm.';
    case 'not_found':
      return 'That sign-up is no longer on the list.';
  }
}
