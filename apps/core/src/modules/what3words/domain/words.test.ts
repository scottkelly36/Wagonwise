import { describe, expect, it } from 'vitest';
import { parseWords } from './words.js';

describe('parseWords', () => {
  it.each([
    ['filled.count.soap', 'filled.count.soap'],
    ['///filled.count.soap', 'filled.count.soap'],
    ['  /// Filled Count Soap  ', 'filled.count.soap'],
    ['filled,count,soap', 'filled.count.soap'],
    ['FILLED.COUNT.SOAP.', 'filled.count.soap'],
    ['index.home.raft', 'index.home.raft'],
    ['écran.chat.maison', 'écran.chat.maison'],
  ])('reads %j as %j', (raw, words) => {
    expect(parseWords(raw)).toEqual({ ok: true, value: words });
  });

  it.each([
    '',
    'filled.count',
    'filled.count.soap.extra',
    'filled.count.so4p',
    '12.34.56',
    '/',
    'a.b.c!',
  ])('refuses %j', (raw) => {
    expect(parseWords(raw)).toEqual({ ok: false, error: { tag: 'InvalidWords' } });
  });
});
