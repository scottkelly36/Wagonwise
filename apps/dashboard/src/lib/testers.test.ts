import { describe, expect, it } from 'vitest';
import { canInvite, inviteSummary, roleLabel, testersCsv } from './testers';

describe('testersCsv', () => {
  it('writes a header and a row each, with blanks for what was not given', () => {
    const csv = testersCsv([
      { id: '1', email: 'sam@example.com', role: 'driver', createdAt: '2026-10-09T09:00:00.000Z' },
      {
        id: '2',
        email: 'kim@acme.co.uk',
        name: 'Kim, M',
        role: 'company',
        company: 'Acme',
        fleetSize: '6-15',
        createdAt: '2026-10-09T10:00:00.000Z',
        invitedAt: '2026-10-10T08:00:00.000Z',
        inviteCode: 'ABCD2345',
      },
    ]);
    expect(csv.split('\r\n')).toEqual([
      '﻿Email,Name,Role,Company,Fleet size,Signed up,Invited,Invite code',
      'sam@example.com,,Driver,,,2026-10-09T09:00:00.000Z,,',
      'kim@acme.co.uk,"Kim, M",Company,Acme,6-15,2026-10-09T10:00:00.000Z,2026-10-10T08:00:00.000Z,ABCD2345',
      '',
    ]);
  });

  it('names the roles', () => {
    expect(roleLabel('both')).toBe('Driver and company');
  });
});

describe('inviting', () => {
  it('sums up a send in a sentence', () => {
    expect(inviteSummary([{ id: 'a', status: 'sent' }])).toBe('1 invite sent.');
    expect(
      inviteSummary([
        { id: 'a', status: 'sent' },
        { id: 'b', status: 'sent' },
        { id: 'c', status: 'failed' },
        { id: 'd', status: 'already_invited' },
      ]),
    ).toBe(
      '2 invites sent. 1 could not be sent, so try again. 1 left out (already invited, or no longer on the list).',
    );
  });

  it('only offers those not yet invited', () => {
    const base = {
      id: '1',
      email: 'a@b.co',
      role: 'driver' as const,
      createdAt: '2026-10-09T09:00:00.000Z',
    };
    expect(canInvite(base)).toBe(true);
    expect(canInvite({ ...base, invitedAt: '2026-10-10T08:00:00.000Z' })).toBe(false);
  });
});
