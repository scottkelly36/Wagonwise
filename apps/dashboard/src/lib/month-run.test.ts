import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import {
  MIN_COLLECT_PENCE,
  executeMonthRun,
  planMonthRun,
  type DraftToRun,
  type RunIo,
} from './month-run';

const draft = (id: string, company: string, totalPence: number): DraftToRun => ({
  id,
  companyId: `co-${id}`,
  companyName: company,
  totalPence,
});

describe('planMonthRun', () => {
  const drafts = [
    draft('1', 'Acme', 3000),
    draft('2', 'Beta', 1000),
    draft('3', 'Gamma', 20),
    draft('4', 'Delta', 0),
    draft('5', 'Epsilon', 5000),
  ];
  // Acme and Gamma have a card; Beta has none; Epsilon is not known.
  const cards = new Map([
    ['co-1', true],
    ['co-2', false],
    ['co-3', true],
  ]);

  it('charges a firm with payment details, issues the rest, and leaves a nil draft alone', () => {
    const plan = planMonthRun(drafts, cards);
    expect(plan.issueAndCollect.map((d) => d.companyName)).toEqual(['Acme']);
    expect(plan.issueOnly.map((i) => [i.draft.companyName, i.reason])).toEqual([
      ['Beta', 'no_card'],
      ['Gamma', 'under_minimum'],
      ['Epsilon', 'no_card'],
    ]);
    expect(plan.leave.map((d) => d.companyName)).toEqual(['Delta']);
  });

  it('totals what would be issued, not what is left', () => {
    expect(planMonthRun(drafts, cards).totalPence).toBe(3000 + 1000 + 20 + 5000);
  });

  it('takes a payment of exactly the minimum, and not one penny under', () => {
    const plan = planMonthRun(
      [draft('a', 'At', MIN_COLLECT_PENCE), draft('b', 'Under', MIN_COLLECT_PENCE - 1)],
      new Map([
        ['co-a', true],
        ['co-b', true],
      ]),
    );
    expect(plan.issueAndCollect.map((d) => d.companyName)).toEqual(['At']);
    expect(plan.issueOnly.map((i) => i.draft.companyName)).toEqual(['Under']);
  });
});

function io(overrides: Partial<RunIo> = {}) {
  const calls: string[] = [];
  const base: RunIo = {
    issue: (id) => {
      calls.push(`issue ${id}`);
      return Promise.resolve();
    },
    collect: (id) => {
      calls.push(`collect ${id}`);
      return Promise.resolve();
    },
    describe: (error) => (error instanceof Error ? error.message : 'unknown'),
  };
  return { io: { ...base, ...overrides }, calls };
}

describe('executeMonthRun', () => {
  const plan = planMonthRun(
    [draft('1', 'Acme', 3000), draft('2', 'Beta', 1000)],
    new Map([['co-1', true]]),
  );

  it('issues every draft, and asks for payment only from the firm that has a card', async () => {
    const { io: fake, calls } = io();
    const out = await executeMonthRun(plan, fake);
    expect(calls).toEqual(['issue 1', 'collect 1', 'issue 2']);
    expect(out.results.map((r) => [r.company, r.status])).toEqual([
      ['Acme', 'charging'],
      ['Beta', 'issued'],
    ]);
    expect(out.stoppedBy).toBeUndefined();
  });

  it('carries on past a firm that fails, and says what went wrong with it', async () => {
    const { io: fake, calls } = io({
      issue: (id) =>
        id === '1' ? Promise.reject(new Error('could not issue')) : Promise.resolve(),
    });
    const out = await executeMonthRun(plan, fake);
    expect(out.results.map((r) => [r.company, r.status, r.note])).toEqual([
      ['Acme', 'issue_failed', 'could not issue'],
      ['Beta', 'issued', undefined],
    ]);
    expect(calls).not.toContain('collect 1');
  });

  it('says so when an invoice was issued but the payment could not be asked for, and does not ask twice', async () => {
    let asked = 0;
    const { io: fake } = io({
      collect: () => {
        asked += 1;
        return Promise.reject(new Error('Stripe is down'));
      },
    });
    const out = await executeMonthRun(plan, fake);
    expect(out.results[0]).toMatchObject({
      company: 'Acme',
      status: 'issued_not_charged',
      note: 'Stripe is down',
    });
    expect(asked).toBe(1);
  });

  it('stops everything, with nothing issued, when the billing details still hold brackets', async () => {
    const { io: fake } = io({
      issue: () => Promise.reject(new ApiError('BillingDetailsIncomplete', 409)),
      describe: () => 'Fill in your billing details first.',
    });
    const out = await executeMonthRun(plan, fake);
    expect(out.results).toEqual([]);
    expect(out.stoppedBy).toBe('Fill in your billing details first.');
  });
});
