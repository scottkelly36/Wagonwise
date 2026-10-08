import { ApiError } from '../api/errors';
import { REQUEST_OTP_MESSAGES, signInErrorMessage } from './sign-in-errors';

const say = (error: unknown) => signInErrorMessage(error, REQUEST_OTP_MESSAGES);

describe('signInErrorMessage', () => {
  it('uses the specific sentence for a named problem', () => {
    expect(say(new ApiError('InvalidInviteCode', 400))).toBe("That invite code isn't recognised.");
  });

  it('says the code could not be sent when delivery failed', () => {
    expect(say(new ApiError('CodeNotSent', 502))).toMatch(/couldn't send your sign-in code/);
  });

  it('counts down wrong-code attempts', () => {
    expect(say(new ApiError('OtpIncorrect', 400, 2))).toBe('Wrong code. 2 attempts left.');
    expect(say(new ApiError('OtpIncorrect', 400, 1))).toBe('Wrong code. 1 attempt left.');
    expect(say(new ApiError('OtpIncorrect', 400))).toBe('Wrong code.');
  });

  it('says it is not the driver’s fault when the server failed', () => {
    expect(say(new ApiError('internal', 500))).toMatch(/isn't something you did/);
    expect(say(new ApiError('bad_gateway', 502))).toMatch(/isn't something you did/);
  });

  it('asks the driver to check what they typed for a rejected request', () => {
    expect(say(new ApiError('invalid_request', 400))).toMatch(/Check the details you typed/);
  });

  it('tells a driver who is rate limited to wait', () => {
    expect(say(new ApiError('rate_limited', 429))).toMatch(/Wait a minute/);
  });

  it('says to check the connection when the server was not reached at all', () => {
    expect(say(new TypeError('Network request failed'))).toBe(
      "Couldn't reach the server. Check your connection.",
    );
  });

  it('keeps a plain fallback for anything else', () => {
    expect(say(new ApiError('Teapot', 418))).toBe('Something went wrong. Try again.');
  });
});
