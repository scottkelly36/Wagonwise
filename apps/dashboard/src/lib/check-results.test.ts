import type { CheckItem } from '@wagonwise/contracts/checks';
import { describe, expect, it } from 'vitest';
import { answerText, rangeFor, whenText } from './check-results';

describe('rangeFor', () => {
  it('ends today and runs back the days chosen, both included', () => {
    expect(rangeFor('today', '2026-10-09')).toEqual({ from: '2026-10-09', to: '2026-10-09' });
    expect(rangeFor('7', '2026-10-09')).toEqual({ from: '2026-10-03', to: '2026-10-09' });
    expect(rangeFor('30', '2026-10-09')).toEqual({ from: '2026-09-10', to: '2026-10-09' });
  });

  it('crosses a month and a year end', () => {
    expect(rangeFor('7', '2026-01-03').from).toBe('2025-12-28');
  });
});

describe('answerText', () => {
  const passFail: CheckItem = {
    id: 'a',
    kind: 'pass_fail',
    label: 'Tyres',
    required: true,
    severity: 'advisory',
    photoOnDefect: false,
  };
  const yesNo: CheckItem = {
    id: 'b',
    kind: 'yes_no',
    label: 'Papers?',
    required: true,
    defectWhen: 'no',
    severity: 'advisory',
    photoOnDefect: false,
  };
  const number: CheckItem = {
    id: 'c',
    kind: 'number',
    label: 'Odometer',
    required: true,
    unit: 'miles',
    severity: 'advisory',
  };

  it('puts each kind of answer in words', () => {
    expect(answerText(passFail, { itemId: 'a', value: 'ok' })).toBe('OK');
    expect(answerText(passFail, { itemId: 'a', value: 'defect' })).toBe('Defect');
    expect(answerText(yesNo, { itemId: 'b', value: 'yes' })).toBe('Yes');
    expect(answerText(yesNo, { itemId: 'b', value: 'no' })).toBe('No');
    expect(answerText(number, { itemId: 'c', value: 125000 })).toBe('125000 miles');
    expect(
      answerText(
        { id: 'd', kind: 'note', label: 'Notes', required: false },
        { itemId: 'd', value: 'Mind the gate' },
      ),
    ).toBe('Mind the gate');
    expect(
      answerText(
        { id: 'e', kind: 'photo', label: 'Load', required: true },
        { itemId: 'e', value: 'photo' },
      ),
    ).toBe('Photo');
  });

  it('shows a dash for a question that was left alone', () => {
    expect(answerText(passFail, undefined)).toBe('—');
  });
});

describe('whenText', () => {
  it('reads in UK time, so summer evenings are not an hour out', () => {
    expect(whenText('2026-07-01T07:30:00.000Z')).toContain('08:30');
    expect(whenText('2026-12-01T07:30:00.000Z')).toContain('07:30');
  });
});
