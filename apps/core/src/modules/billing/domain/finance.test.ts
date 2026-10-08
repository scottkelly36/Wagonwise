import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import {
  activeCosts,
  costsTotal,
  isActiveIn,
  isOneOff,
  monthFigures,
  monthsEndingAt,
  nextMonth,
  planChange,
  planStop,
  previousMonth,
  projection,
  revenueByCompany,
  revenueFor,
  validateCostFields,
  type Cost,
} from './finance.js';
import type { Invoice } from './invoice.js';

const cost = (over: Partial<Cost> = {}): Cost => ({
  id: makeId<'CostId'>('k1'),
  category: 'hosting',
  description: 'Servers',
  amountPence: 5000,
  fromMonth: '2026-08',
  toMonth: undefined,
  ...over,
});

const acme = makeId<'CompanyId'>('c-acme');
const beta = makeId<'CompanyId'>('c-beta');
function invoice(
  companyId: typeof acme,
  name: string,
  month: string,
  status: Invoice['status'],
  pence: number,
): Invoice {
  return {
    id: makeId<'InvoiceId'>(`${name}-${month}-${status}`),
    companyId,
    companyName: name,
    month,
    status,
    number: status === 'draft' ? undefined : 'INV-1',
    lines: [
      {
        id: makeId<'InvoiceLineId'>('l'),
        description: 'Plan',
        quantity: 1,
        unitPence: pence,
        amountPence: pence,
      },
    ],
    createdAt: new Date('2026-10-01T09:00:00.000Z'),
    issuedAt: undefined,
    paidAt: undefined,
    voidedAt: undefined,
    issuedDetails: undefined,
  };
}

describe('months', () => {
  it('step back and forward across a year end', () => {
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2025-12')).toBe('2026-01');
    expect(previousMonth('2026-10')).toBe('2026-09');
  });

  it('lists the months ending at one, oldest first', () => {
    expect(monthsEndingAt('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsEndingAt('2026-10', 1)).toEqual(['2026-10']);
  });
});

describe('standing costs', () => {
  it('apply from their first month and carry on until stopped', () => {
    const open = cost();
    expect(isActiveIn(open, '2026-07')).toBe(false);
    expect(isActiveIn(open, '2026-08')).toBe(true);
    expect(isActiveIn(open, '2030-01')).toBe(true);
    const ended = cost({ toMonth: '2026-10' });
    expect(isActiveIn(ended, '2026-10')).toBe(true);
    expect(isActiveIn(ended, '2026-11')).toBe(false);
  });

  it('can be a one-off, for a single month', () => {
    const oneOff = cost({ fromMonth: '2026-09', toMonth: '2026-09' });
    expect(isOneOff(oneOff)).toBe(true);
    expect(isOneOff(cost())).toBe(false);
    expect(costsTotal([oneOff], '2026-09')).toBe(5000);
    expect(costsTotal([oneOff], '2026-10')).toBe(0);
  });

  it('add up for a month', () => {
    const costs = [
      cost(),
      cost({ id: makeId<'CostId'>('k2'), amountPence: 1500, fromMonth: '2026-10' }),
    ];
    expect(costsTotal(costs, '2026-09')).toBe(5000);
    expect(costsTotal(costs, '2026-10')).toBe(6500);
    expect(activeCosts(costs, '2026-09')).toHaveLength(1);
  });
});

describe('planChange', () => {
  it('updates the row itself when the change is from the month it started', () => {
    expect(planChange(cost(), '2026-08')).toEqual({ ok: true, value: { kind: 'update' } });
  });

  it('splits a later change, closing the old row the month before so earlier months keep their amount', () => {
    expect(planChange(cost(), '2026-11')).toEqual({
      ok: true,
      value: { kind: 'split', closeTo: '2026-10', newFrom: '2026-11' },
    });
  });

  it('refuses a change from before it started, or after it ended', () => {
    expect(planChange(cost(), '2026-07')).toEqual({
      ok: false,
      error: { tag: 'InvalidCostChange', reason: 'before_start' },
    });
    expect(planChange(cost({ toMonth: '2026-10' }), '2026-12')).toEqual({
      ok: false,
      error: { tag: 'InvalidCostChange', reason: 'after_end' },
    });
  });
});

describe('planStop', () => {
  it('ends the cost the month before the stop', () => {
    expect(planStop(cost(), '2026-12')).toEqual({
      ok: true,
      value: { kind: 'end', toMonth: '2026-11' },
    });
  });

  it('removes a cost stopped from its first month, since it never applied', () => {
    expect(planStop(cost(), '2026-08')).toEqual({ ok: true, value: { kind: 'remove' } });
    expect(planStop(cost(), '2026-01')).toEqual({ ok: true, value: { kind: 'remove' } });
  });

  it('refuses to stop something that has already ended', () => {
    expect(planStop(cost({ toMonth: '2026-10' }), '2026-12')).toEqual({
      ok: false,
      error: { tag: 'InvalidCostChange', reason: 'already_ended' },
    });
  });
});

describe('validateCostFields', () => {
  it('trims the text and accepts whole pence from nothing upwards', () => {
    const ok = validateCostFields({
      category: 'hosting',
      description: '  Servers ',
      amountPence: 0,
    });
    expect(ok).toEqual({
      ok: true,
      value: { category: 'hosting', description: 'Servers', amountPence: 0 },
    });
  });

  it('refuses an unknown category, blank or long text, and an amount that is not whole pence or is negative', () => {
    const reason = (input: Parameters<typeof validateCostFields>[0]) => {
      const r = validateCostFields(input);
      return r.ok ? 'ok' : r.error.reason;
    };
    const base = { category: 'hosting', description: 'x', amountPence: 100 };
    expect(reason({ ...base, category: 'lunch' })).toBe('category');
    expect(reason({ ...base, description: '  ' })).toBe('description');
    expect(reason({ ...base, description: 'x'.repeat(121) })).toBe('description');
    expect(reason({ ...base, amountPence: -1 })).toBe('amount');
    expect(reason({ ...base, amountPence: 10.5 })).toBe('amount');
  });
});

describe('revenue', () => {
  const invoices = [
    invoice(acme, 'Acme', '2026-10', 'paid', 5000),
    invoice(beta, 'Beta', '2026-10', 'issued', 3000),
    invoice(acme, 'Acme', '2026-10', 'void', 9999),
    invoice(beta, 'Beta', '2026-10', 'draft', 7777),
    invoice(acme, 'Acme', '2026-09', 'paid', 4000),
  ];

  it('counts issued and paid invoices as invoiced, and paid ones as received; never drafts or cancelled', () => {
    expect(revenueFor(invoices, '2026-10')).toEqual({ invoicedPence: 8000, receivedPence: 5000 });
    expect(revenueFor(invoices, '2026-09')).toEqual({ invoicedPence: 4000, receivedPence: 4000 });
    expect(revenueFor(invoices, '2026-08')).toEqual({ invoicedPence: 0, receivedPence: 0 });
  });

  it('breaks a month down by company, A to Z', () => {
    expect(revenueByCompany(invoices, '2026-10')).toEqual([
      { companyId: acme, name: 'Acme', invoicedPence: 5000, receivedPence: 5000 },
      { companyId: beta, name: 'Beta', invoicedPence: 3000, receivedPence: 0 },
    ]);
  });

  it('sets a month’s costs against its revenue, on both measures', () => {
    expect(monthFigures('2026-10', invoices, [cost({ amountPence: 6500 })])).toEqual({
      month: '2026-10',
      invoicedPence: 8000,
      receivedPence: 5000,
      costsPence: 6500,
      profitInvoicedPence: 1500,
      profitReceivedPence: -1500,
    });
  });
});

describe('projection', () => {
  it('works out revenue from the plans, profit against standing costs, and the break-even number of vehicles', () => {
    const result = projection({
      plans: [
        { capacityToday: 5, pricePerVehiclePence: 1000 },
        { capacityToday: 3, pricePerVehiclePence: 1500 },
      ],
      monthlyCostsPence: 10000,
      defaultPricePence: 1000,
    });
    expect(result).toEqual({
      monthlyRevenuePence: 9500,
      monthlyCostsPence: 10000,
      projectedProfitPence: -500,
      vehiclesCovered: 8,
      averagePricePence: 1188,
      breakEvenVehicles: 9,
    });
  });

  it('uses the default price when nothing is covered yet, and says nothing about break-even at a price of nothing', () => {
    expect(
      projection({ plans: [], monthlyCostsPence: 5000, defaultPricePence: 1000 }),
    ).toMatchObject({ vehiclesCovered: 0, averagePricePence: 1000, breakEvenVehicles: 5 });
    expect(
      projection({ plans: [], monthlyCostsPence: 5000, defaultPricePence: 0 }).breakEvenVehicles,
    ).toBeNull();
  });
});
