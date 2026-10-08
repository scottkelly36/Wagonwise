import type { InvoiceDto } from '@wagonwise/contracts/billing';
import { describe, expect, it } from 'vitest';
import { invoiceHtml, monthLabel } from './invoice-print';

const draft: InvoiceDto = {
  id: 'i1',
  companyId: 'c1',
  companyName: 'Acme <Freight> & Sons',
  month: '2026-10',
  status: 'draft',
  lines: [
    {
      id: 'l1',
      description: '5 vehicles covered, October 2026',
      quantity: 5,
      unitPence: 1000,
      amountPence: 5000,
    },
    { id: 'l2', description: 'Goodwill credit', quantity: 1, unitPence: -500, amountPence: -500 },
  ],
  totalPence: 4500,
  createdAt: '2026-11-02T09:00:00.000Z',
};

const issued: InvoiceDto = {
  ...draft,
  status: 'issued',
  number: 'INV-0007',
  issuedAt: '2026-11-03T09:00:00.000Z',
  issuedDetails: {
    tradingName: 'WagonWise Ltd',
    address: '1 High Street\nHexham NE46 1AA',
    contactEmail: 'billing@example.com',
    paymentDetails: 'Sort code 00-00-00\nAccount 00000000',
    vatStatus: 'Not VAT registered',
    paymentTerms: 'Payment within 14 days',
  },
};

describe('invoiceHtml', () => {
  it('marks a draft clearly, with no number and no payment details', () => {
    const html = invoiceHtml(draft);
    expect(html).toContain('Draft invoice');
    expect(html).toContain('class="draft">DRAFT');
    expect(html).toContain('Not yet issued');
    expect(html).not.toContain('How to pay');
  });

  it('shows the lines, the credit and the total in pounds', () => {
    const html = invoiceHtml(draft);
    expect(html).toContain('£50.00');
    expect(html).toContain('-£5.00');
    expect(html).toContain('Total due</td><td class="num">£45.00');
    expect(html).toContain('October 2026');
  });

  it('prints an issued invoice with its number, the issuer and how to pay, and no DRAFT mark', () => {
    const html = invoiceHtml(issued);
    expect(html).toContain('INV-0007');
    expect(html).toContain('WagonWise Ltd');
    expect(html).toContain('1 High Street<br>Hexham NE46 1AA');
    expect(html).toContain('Sort code 00-00-00<br>Account 00000000');
    expect(html).toContain('Payment within 14 days');
    expect(html).toContain('Not VAT registered');
    expect(html).not.toContain('class="draft"');
    expect(html).toContain('3 November 2026');
  });

  it('escapes everything it prints', () => {
    const html = invoiceHtml({
      ...issued,
      issuedDetails: { ...issued.issuedDetails!, tradingName: '<script>alert(1)</script>' },
    });
    expect(html).toContain('Acme &lt;Freight&gt; &amp; Sons');
    expect(html).not.toContain('<script>alert');
  });

  it('says so on a cancelled or paid invoice', () => {
    expect(invoiceHtml({ ...issued, status: 'void' })).toContain('has been cancelled');
    expect(
      invoiceHtml({ ...issued, status: 'paid', paidAt: '2026-11-20T09:00:00.000Z' }),
    ).toContain('Paid 20 November 2026');
  });
});

describe('monthLabel', () => {
  it('names the month', () => {
    expect(monthLabel('2026-02')).toBe('February 2026');
  });
});
