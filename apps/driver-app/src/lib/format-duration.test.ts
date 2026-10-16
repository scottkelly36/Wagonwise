import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it('keeps minutes under an hour', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(1)).toBe('1 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(59)).toBe('59 min');
  });

  it('turns an hour or more into hours and minutes', () => {
    expect(formatDuration(60)).toBe('1 h');
    expect(formatDuration(65)).toBe('1 h 5 min');
    expect(formatDuration(355)).toBe('5 h 55 min');
    expect(formatDuration(755)).toBe('12 h 35 min');
    expect(formatDuration(1500)).toBe('25 h');
  });

  it('rounds to the nearest minute, carrying into the hour', () => {
    expect(formatDuration(59.6)).toBe('1 h');
    expect(formatDuration(120.4)).toBe('2 h');
    expect(formatDuration(-3)).toBe('0 min');
  });
});
