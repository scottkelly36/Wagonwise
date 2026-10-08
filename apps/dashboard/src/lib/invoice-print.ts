import type { InvoiceDto } from '@wagonwise/contracts/billing';

import { escapeHtml } from './delivery-record';
import { formatPence } from './money';

/** `2026-10` → "October 2026". */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const dayLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London',
  });

/** Newlines in an address or bank details become line breaks; everything else is escaped. */
const multiline = (text: string): string => escapeHtml(text).replace(/\r?\n/g, '<br>');

/**
 * An invoice as a printable page (the browser's Save as PDF), in the same way as the delivery records. An
 * issued invoice prints WagonWise's details as they were the day it was issued, not as they are now. A draft
 * prints with DRAFT across it and no number, so it can be checked on paper but not mistaken for the real one.
 */
export function invoiceHtml(invoice: InvoiceDto): string {
  const issuer = invoice.issuedDetails;
  const isDraft = invoice.status === 'draft';
  const title = isDraft ? 'Draft invoice' : 'Invoice';
  const rows = invoice.lines
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.description)}</td>
        <td class="num">${formatPence(l.amountPence)}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)} ${escapeHtml(invoice.number ?? invoice.companyName)}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; color: #111; max-width: 760px; margin: 32px auto; padding: 0 16px; position: relative; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  .muted { color: #555; }
  .top { display: flex; justify-content: space-between; gap: 24px; margin: 24px 0; }
  table { width: 100%; border-collapse: collapse; margin: 24px 0 8px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: 700; border-bottom: 0; font-size: 16px; }
  .draft { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 120px; font-weight: 800;
    color: rgba(200, 0, 0, 0.12); transform: rotate(-20deg); pointer-events: none; }
  .pay { margin-top: 28px; padding: 12px 14px; background: #f5f5f5; border-radius: 6px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
${isDraft ? '<div class="draft">DRAFT</div>' : ''}
<h1>${escapeHtml(title)}</h1>
<div class="muted">${invoice.number === undefined ? 'Not yet issued' : escapeHtml(invoice.number)}</div>

<div class="top">
  <div>
    <strong>To</strong><br>${escapeHtml(invoice.companyName)}
  </div>
  <div>
    <strong>From</strong><br>${
      issuer === undefined
        ? '<span class="muted">Shown once issued</span>'
        : `${escapeHtml(issuer.tradingName)}<br>${multiline(issuer.address)}<br>${escapeHtml(issuer.contactEmail)}`
    }
  </div>
  <div>
    <strong>Date</strong><br>${invoice.issuedAt === undefined ? 'Not yet issued' : escapeHtml(dayLabel(invoice.issuedAt))}<br>
    <strong>For</strong><br>${escapeHtml(monthLabel(invoice.month))}
  </div>
</div>

<table>
  <thead><tr><th>Description</th><th class="num">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td>Total due</td><td class="num">${formatPence(invoice.totalPence)}</td></tr></tfoot>
</table>
${
  issuer === undefined
    ? ''
    : `<div class="muted">${escapeHtml(issuer.vatStatus)}</div>
<div class="pay">
  <strong>How to pay</strong><br>${multiline(issuer.paymentDetails)}<br>
  <span class="muted">${escapeHtml(issuer.paymentTerms)}. Please quote ${escapeHtml(invoice.number ?? '')}.</span>
</div>`
}
${invoice.status === 'void' ? '<p><strong>This invoice has been cancelled.</strong></p>' : ''}
${invoice.status === 'paid' && invoice.paidAt !== undefined ? `<p><strong>Paid ${escapeHtml(dayLabel(invoice.paidAt))}. Thank you.</strong></p>` : ''}
</body>
</html>`;
}
