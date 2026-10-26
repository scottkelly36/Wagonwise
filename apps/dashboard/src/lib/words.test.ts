import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { wordsKey, wordsLookupMessage } from './words';

describe('wordsKey', () => {
  it.each([
    ['filled.count.soap', 'filled.count.soap'],
    ['///filled.count.soap', 'filled.count.soap'],
    ['  /// Filled Count Soap  ', 'filled.count.soap'],
    ['filled,count,soap', 'filled.count.soap'],
    ['FILLED.COUNT.SOAP.', 'filled.count.soap'],
    ['écran.chat.maison', 'écran.chat.maison'],
  ])('reads %j as %j', (text, key) => {
    expect(wordsKey(text)).toBe(key);
  });

  it.each(['', 'filled.count', 'filled.count.soap.extra', 'filled.count.so4p', '12.34.56', '/'])(
    'refuses %j',
    (text) => {
      expect(wordsKey(text)).toBeUndefined();
    },
  );
});

describe('wordsLookupMessage', () => {
  it('says what to do for each kind of failure', () => {
    expect(wordsLookupMessage(new ApiError('InvalidWords', 400))).toMatch(/three words/);
    expect(wordsLookupMessage(new ApiError('WordsNotFound', 404))).toMatch(/spelling/);
    expect(wordsLookupMessage(new ApiError('LookupUnavailable', 503))).toMatch(/postcode/);
    expect(wordsLookupMessage(new Error('offline'))).toMatch(/connection/);
  });
});
