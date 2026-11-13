import type { ProspectDto } from '@wagonwise/contracts/sales';
import { describe, expect, it } from 'vitest';

import {
  draftEmail,
  emailBlockedReason,
  firstNameOf,
  mailtoLink,
  problemFor,
  type DraftSettings,
} from './sales-email';

const firm = (over: Partial<ProspectDto> = {}): ProspectDto => ({
  id: 'f1',
  name: 'Tyne Valley Haulage',
  legalForm: 'limited',
  relationship: 'new',
  stage: 'not_contacted',
  createdAt: '2026-11-01T09:00:00.000Z',
  ...over,
});

const settings = (over: Partial<DraftSettings> = {}): DraftSettings => ({
  kind: 'cold',
  problem: 'checks',
  found: 'on your website',
  storesLive: false,
  phone: '07700 900123',
  ...over,
});

describe('firstNameOf', () => {
  it('takes the first word of the contact person', () => {
    expect(firstNameOf('  Dave Smith ')).toBe('Dave');
    expect(firstNameOf('Dave')).toBe('Dave');
  });
  it('is undefined when there is no name', () => {
    expect(firstNameOf(undefined)).toBeUndefined();
    expect(firstNameOf('   ')).toBeUndefined();
  });
});

describe('problemFor', () => {
  it('leads with what the last pitch was about, and with checks when there is none', () => {
    expect(problemFor('maintenance')).toBe('dates');
    expect(problemFor('proof_of_delivery')).toBe('chasing');
    expect(problemFor('jobs')).toBe('chasing');
    expect(problemFor('fuel_costs')).toBe('profit');
    expect(problemFor('checks')).toBe('checks');
    expect(problemFor(undefined)).toBe('checks');
  });
});

describe('emailBlockedReason', () => {
  it('blocks a firm that asked not to be contacted, and a sole trader or partnership', () => {
    expect(emailBlockedReason(firm({ stage: 'do_not_contact' }))).toMatch(/not to be contacted/);
    expect(emailBlockedReason(firm({ legalForm: 'sole_trader_or_partnership' }))).toMatch(
      /phone only/i,
    );
  });
  it('allows a limited company, and one not checked yet', () => {
    expect(emailBlockedReason(firm())).toBeUndefined();
    expect(emailBlockedReason(firm({ legalForm: 'unknown' }))).toBeUndefined();
  });
});

describe('draftEmail', () => {
  it('names the person and the firm, says how they were found, and gives a way to say no', () => {
    const d = draftEmail(firm({ contactPerson: 'Dave Smith' }), settings({ kind: 'listening' }));
    expect(d.subject).toBe('Dave, 15 minutes of your time?');
    expect(d.body).toContain('Hi Dave,');
    expect(d.body).toContain('firms like Tyne Valley Haulage');
    expect(d.body).toContain('I found your details on your website');
    expect(d.body).toContain('just reply “no thanks”');
  });

  it('greets by "there" and keeps the subject plain when there is no contact person', () => {
    const d = draftEmail(firm(), settings());
    expect(d.body.startsWith('Hi there,')).toBe(true);
    expect(d.subject).toBe('A quick question about walk-round checks');
  });

  it('describes the app as in testing until both stores are live', () => {
    expect(draftEmail(firm(), settings()).body).toContain('in testing on Android now');
    expect(draftEmail(firm(), settings({ storesLive: true })).body).toContain(
      'free on Google Play and the App Store',
    );
  });

  it('puts the owner phone number in the signature only when given', () => {
    expect(draftEmail(firm(), settings()).body).toContain('WagonWise Ltd · 07700 900123');
    const without = draftEmail(firm(), settings({ phone: ' ' })).body;
    expect(without).toContain('WagonWise Ltd\nRegistered in England and Wales');
    expect(without).not.toContain(' · ');
  });

  it('leads with the chosen problem', () => {
    const d = draftEmail(firm(), settings({ problem: 'dates' }));
    expect(d.subject).toContain('MOT and inspection dates');
    expect(d.body).toContain('How do you keep track of MOT');
  });

  it('writes every kind, and leaves square brackets only for what the owner must fill in', () => {
    for (const kind of ['cold', 'listening', 'week', 'month', 'demo'] as const) {
      const d = draftEmail(firm({ contactPerson: 'Dave' }), settings({ kind }));
      expect(d.subject.length).toBeGreaterThan(0);
      expect(d.body.length).toBeGreaterThan(40);
    }
    expect(draftEmail(firm(), settings({ kind: 'demo' })).body).toContain('[date]');
    expect(draftEmail(firm(), settings({ kind: 'cold' })).body).not.toContain('[');
  });

  it('states the founding terms as the playbook does, never forever', () => {
    const d = draftEmail(firm(), settings({ kind: 'demo' })).body;
    expect(d).toContain('three free months');
    expect(d).toContain('£10 per vehicle per month for your first year, then the standard £15');
  });
});

describe('mailtoLink', () => {
  it('encodes the address, subject and body for the owner own mail app', () => {
    const link = mailtoLink(' info@example.com ', { subject: 'A & B', body: 'Hi,\nthere' });
    expect(link).toBe('mailto:info@example.com?subject=A%20%26%20B&body=Hi%2C%0Athere');
  });
});
