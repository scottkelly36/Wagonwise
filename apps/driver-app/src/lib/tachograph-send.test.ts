import {
  cardStatus,
  downloadedDay,
  fileProblem,
  sendNotice,
  sizeText,
  statusText,
  ukDay,
} from './tachograph-send';

const NOW = new Date('2026-11-26T10:00:00Z');

describe('downloadedDay', () => {
  it('takes the day the file was last changed, in UK time', () => {
    expect(downloadedDay(Date.parse('2026-11-20T09:00:00Z'), NOW)).toBe('2026-11-20');
    // 23:30 UTC on 30 June is already 1 July in the UK.
    expect(downloadedDay(Date.parse('2026-06-30T23:30:00Z'), NOW)).toBe('2026-07-01');
  });

  it('is today when the phone does not say, and never a future day', () => {
    expect(downloadedDay(undefined, NOW)).toBe('2026-11-26');
    expect(downloadedDay(0, NOW)).toBe('2026-11-26');
    expect(downloadedDay(Number.NaN, NOW)).toBe('2026-11-26');
    expect(downloadedDay(Date.parse('2027-01-01T00:00:00Z'), NOW)).toBe('2026-11-26');
  });
});

describe('fileProblem', () => {
  it('turns away an empty file and a file that is far too big for a card', () => {
    expect(fileProblem(0)).toMatch(/empty/);
    expect(fileProblem(7_000_000)).toMatch(/too big/);
  });

  it('lets a normal file through, and one whose size the phone did not give', () => {
    expect(fileProblem(280_000)).toBeUndefined();
    expect(fileProblem(undefined)).toBeUndefined();
  });
});

describe('what the driver is told', () => {
  it('says nothing has been sent yet', () => {
    expect(statusText(undefined, NOW)).toBe('You have not sent a file here yet.');
  });

  it('gives the next due day, or says it was due, and never says they are fine', () => {
    expect(statusText('2026-11-20', NOW)).toBe(
      'Last file sent: downloaded 20 Nov 2026. The next is due by 18 Dec 2026.',
    );
    expect(statusText('2026-10-01', NOW)).toBe(
      'Last file sent: downloaded 1 Oct 2026. A new download was due by 29 Oct 2026.',
    );
    for (const text of [
      statusText('2026-11-20', NOW),
      statusText(undefined, NOW),
      ...sendNotice('Acme'),
    ]) {
      expect(text.toLowerCase()).not.toContain('complian');
    }
    expect(cardStatus('2026-11-20', NOW).state).toBe('ok');
  });

  it('names the company that receives the file, three times over', () => {
    const notice = sendNotice('Acme Haulage');
    expect(notice).toHaveLength(3);
    expect(notice.every((line) => line.includes('Acme Haulage'))).toBe(true);
    expect(notice.join(' ')).toContain('12 months');
  });

  it('reads sizes and UK days', () => {
    expect(sizeText(280_000)).toBe('280 KB');
    expect(ukDay(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
  });
});
