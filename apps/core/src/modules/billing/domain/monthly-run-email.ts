import { monthName, type MonthString } from './invoice.js';

/** What a monthly run did, for the owner's email. */
export interface MonthlyRunSummary {
  readonly month: MonthString;
  readonly drafts: readonly { readonly company: string; readonly totalPence: number }[];
  readonly totalPence: number;
  readonly onTrial: number;
  /** WagonWise's own billing details still hold [brackets], so nothing can be issued until they are filled in. */
  readonly detailsIncomplete: boolean;
}

const pounds = (pence: number): string => `£${(pence / 100).toFixed(2)}`;

/** To the owner: last month's invoices are drafted and waiting for a look. Plain text, like every other email here. */
export function monthlyRunEmail(
  summary: MonthlyRunSummary,
  portalAddress: string | undefined,
): { readonly subject: string; readonly text: string } {
  const month = monthName(summary.month);
  const n = summary.drafts.length;
  const subject =
    n === 0
      ? `Invoices for ${month}: nothing to bill`
      : `Invoices for ${month}: ${n} draft${n === 1 ? '' : 's'}, ${pounds(summary.totalPence)}`;
  const link =
    portalAddress === undefined
      ? 'the Invoices page in the portal'
      : `${portalAddress.replace(/\/+$/, '')}/admin/invoices`;
  return {
    subject,
    text: [
      n === 0
        ? `Last month's run found nothing to bill for ${month}.`
        : `${month}'s invoices are drafted, ready for you to check:`,
      ...summary.drafts.map((d) => `  ${d.company}: ${pounds(d.totalPence)}`),
      ...(summary.onTrial === 0
        ? []
        : [
            `${summary.onTrial} firm${summary.onTrial === 1 ? ' is' : 's are'} still on a free trial and not billed.`,
          ]),
      '',
      summary.detailsIncomplete
        ? 'Your own billing details still have [brackets]: fill them in on the Billing details page first, because invoices cannot be issued until they are.'
        : 'Open them, check each one, then press Issue and collect all: it issues every draft and charges the firms that have a card on file.',
      link,
      '',
      'Nothing has been issued or charged.',
    ].join('\n'),
  };
}
