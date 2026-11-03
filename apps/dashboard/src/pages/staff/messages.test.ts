import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/errors';
import { staffErrorMessage } from './messages';

describe('staffErrorMessage', () => {
  it('uses the wording for a known tag', () => {
    expect(staffErrorMessage(new ApiError('JobNotFound', 404))).toBe(
      'That job could not be found.',
    );
  });

  it('never shows a tag it has no wording for', () => {
    const text = staffErrorMessage(new ApiError('UnknownError', 500));
    expect(text).not.toContain('UnknownError');
    expect(text).toContain('try again');
  });

  it('says what kind of failure it was when the tag has no wording', () => {
    expect(staffErrorMessage(new ApiError('SomethingNew', 401))).toBe('Please sign in again.');
    expect(staffErrorMessage(new ApiError('SomethingNew', 403))).toBe(
      "You're not allowed to do that.",
    );
    expect(staffErrorMessage(new ApiError('SomethingNew', 404))).toBe('That could not be found.');
    expect(staffErrorMessage(new ApiError('SomethingNew', 502))).toContain('tell WagonWise');
    expect(staffErrorMessage(new ApiError('SomethingNew', 400))).not.toContain('SomethingNew');
  });

  it('keeps the lockout wording for too many attempts', () => {
    expect(staffErrorMessage(new ApiError('Anything', 429))).toContain('15 minutes');
  });

  it('tells the person when the server could not be reached', () => {
    expect(staffErrorMessage(new TypeError('Failed to fetch'))).toContain("couldn't reach");
  });

  it('has a plain fallback for anything else', () => {
    expect(staffErrorMessage('boom')).toContain('Something went wrong');
  });
});
