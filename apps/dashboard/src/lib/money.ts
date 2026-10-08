/** Money is held in whole pence everywhere; these two turn it into pounds for people and back. */

/** 1000 → "£10.00", 123456 → "£1,234.56". */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

/**
 * What someone typed as pounds ("10", "10.5", "£10.50") as whole pence, or `undefined` when it is not
 * an amount: negative, more than two decimal places, or not a number.
 */
export function parsePounds(text: string): number | undefined {
  const match = /^£?\s*(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (match === null) return undefined;
  const pounds = Number(match[1]);
  const pence = Number((match[2] ?? '').padEnd(2, '0'));
  return pounds * 100 + pence;
}

/** Today's date as the UK sees it, `YYYY-MM-DD`, for a date field's default. */
export function ukToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
