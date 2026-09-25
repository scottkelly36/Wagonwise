import { formatDateTime, formatTime } from './format-date';

describe('formatDateTime', () => {
  it('formats an ISO timestamp as a UK-style day/month and time', () => {
    const result = formatDateTime('2026-06-15T08:05:00.000Z');
    expect(result).toContain('15');
    expect(result).toMatch(/Jun/);
  });
});

describe('formatTime', () => {
  it('formats a Date as 24-hour clock time only, with no date component', () => {
    const result = formatTime(new Date('2026-06-15T14:05:00.000Z'));
    expect(result).toMatch(/^\d{2}:\d{2}$/);
    expect(result).not.toMatch(/Jun|2026/);
  });
});
