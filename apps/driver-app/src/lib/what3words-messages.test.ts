import { ApiError } from '../api/errors';
import { wordsLookupMessage } from './what3words-messages';

describe('wordsLookupMessage', () => {
  it('says what to do for each kind of failure', () => {
    expect(wordsLookupMessage(new ApiError('InvalidWords', 400))).toMatch(/three words/);
    expect(wordsLookupMessage(new ApiError('WordsNotFound', 404))).toMatch(/spelling/);
    expect(wordsLookupMessage(new ApiError('LookupUnavailable', 503))).toMatch(
      /address or postcode/,
    );
  });

  it('falls back to a signal message for anything else', () => {
    expect(wordsLookupMessage(new Error('Network request failed'))).toMatch(/signal/);
    expect(wordsLookupMessage(new ApiError('Oops', 500))).toMatch(/signal/);
  });
});
