import { ApiError } from '../api/errors';
import {
  PASSWORD_SIGN_IN_MESSAGES,
  REQUEST_OTP_MESSAGES,
  SET_PASSWORD_MESSAGES,
  SIGN_UP_MESSAGES,
  signInErrorMessage,
} from './sign-in-errors';

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

describe('the message when no account is found', () => {
  it('tells a returning driver to try the email or number they used before, and a new one to enter their invite code', () => {
    const message = signInErrorMessage(
      new ApiError('InviteCodeRequired', 400),
      REQUEST_OTP_MESSAGES,
    );
    expect(message).toContain('signed in before');
    expect(message).toContain('invite code');
  });
});

describe('the messages for email and password sign-in', () => {
  it('gives one sentence for a wrong email or password, and a lockout its own', () => {
    const wrong = new ApiError('InvalidCredentials', 401);
    expect(signInErrorMessage(wrong, PASSWORD_SIGN_IN_MESSAGES)).toBe(
      "That email or password isn't right.",
    );
    const locked = new ApiError('TooManyAttempts', 429);
    expect(signInErrorMessage(locked, PASSWORD_SIGN_IN_MESSAGES)).toMatch(/locked for 15 minutes/);
  });

  it('tells a driver with a password not to use the code-only way', () => {
    const error = new ApiError('PasswordRequired', 409);
    expect(signInErrorMessage(error, REQUEST_OTP_MESSAGES)).toMatch(/has a password/);
  });

  it('points an existing email to signing in, and asks for the invite code when one is needed', () => {
    expect(signInErrorMessage(new ApiError('AccountExists', 409), SIGN_UP_MESSAGES)).toMatch(
      /already an account/,
    );
    expect(signInErrorMessage(new ApiError('InviteCodeRequired', 400), SIGN_UP_MESSAGES)).toBe(
      'Enter your invite code to sign up.',
    );
  });

  it('says what is wrong with a password the server turns down', () => {
    expect(signInErrorMessage(new ApiError('PasswordTooShort', 400), SIGN_UP_MESSAGES)).toMatch(
      /at least 10/,
    );
    expect(
      signInErrorMessage(new ApiError('PasswordAlreadySet', 409), SET_PASSWORD_MESSAGES),
    ).toMatch(/Forgot password/);
  });
});
