import { formatDateTime } from './format-date';

describe('formatDateTime', () => {
  it('formats an ISO timestamp as a UK-style day/month and time', () => {
    const result = formatDateTime('2026-06-15T08:05:00.000Z');
    expect(result).toContain('15');
    expect(result).toMatch(/Jun/);
  });
});
