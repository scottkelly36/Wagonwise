import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ApiError } from '../api/errors';
import * as identityApi from '../api/identity';
import SignInScreen from '../app/sign-in';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));

const mockSignIn = jest.fn().mockResolvedValue(undefined);
jest.mock('../state/auth-store', () => ({
  useAuthStore: (select: (s: { signIn: typeof mockSignIn }) => unknown) =>
    select({ signIn: mockSignIn }),
}));

jest.mock('../api/identity');
const api = jest.mocked(identityApi);

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

const signedIn = {
  accessToken: 'access',
  refreshToken: 'refresh',
  driver: { id: 'd1', identifier: 'driver@example.com', createdAt: '2026-11-01T09:00:00.000Z' },
} as Awaited<ReturnType<typeof identityApi.passwordVerify>>;

const PASSWORD_ON = { passwordSignIn: true, inviteRequired: false, google: false, apple: false };

async function open(options: Awaited<ReturnType<typeof identityApi.getSignInOptions>>) {
  api.getSignInOptions.mockResolvedValue(options);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  await render(
    <QueryClientProvider client={client}>
      <SignInScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  mockSignIn.mockResolvedValue(undefined);
});

describe('which sign-in screen shows', () => {
  it('is the code-only screen, with the invite box, when password sign-in is off', async () => {
    await open({ passwordSignIn: false, inviteRequired: true, google: false, apple: false });
    expect(await screen.findByTestId('request-code-button')).toBeTruthy();
    expect(screen.getByTestId('invite-code-input')).toBeTruthy();
    expect(screen.queryByTestId('password-input')).toBeNull();
  });

  it('drops the invite box once the server stops asking for one', async () => {
    await open({ passwordSignIn: false, inviteRequired: false, google: false, apple: false });
    expect(await screen.findByTestId('request-code-button')).toBeTruthy();
    expect(screen.queryByTestId('invite-code-input')).toBeNull();
  });

  it('treats a server that does not know the question as the old code-only one', async () => {
    api.getSignInOptions.mockRejectedValue(new ApiError('UnknownError', 404));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await render(
      <QueryClientProvider client={client}>
        <SignInScreen />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('invite-code-input')).toBeTruthy();
  });

  it('offers a retry, not a guess, when the server cannot be reached', async () => {
    api.getSignInOptions.mockRejectedValue(new TypeError('Network request failed'));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    await render(
      <QueryClientProvider client={client}>
        <SignInScreen />
      </QueryClientProvider>,
    );
    expect(await screen.findByTestId('retry-options', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByTestId('request-code-button')).toBeNull();
  });

  it('is the password screen when password sign-in is on', async () => {
    await open(PASSWORD_ON);
    expect(await screen.findByTestId('password-sign-in-button')).toBeTruthy();
    expect(screen.getByTestId('sign-up-button')).toBeTruthy();
    expect(screen.getByTestId('forgot-button')).toBeTruthy();
  });
});

describe('signing in with a password', () => {
  it('sends the code after a right password, then signs in with it and goes to the app', async () => {
    api.passwordSignIn.mockResolvedValue(undefined);
    api.passwordVerify.mockResolvedValue(signedIn);
    await open(PASSWORD_ON);

    await fireEvent.changeText(
      await screen.findByTestId('identifier-input'),
      ' driver@example.com ',
    );
    await fireEvent.changeText(screen.getByTestId('password-input'), 'a long enough password');
    await fireEvent.press(screen.getByTestId('password-sign-in-button'));
    expect(api.passwordSignIn).toHaveBeenCalledWith('driver@example.com', 'a long enough password');

    await fireEvent.changeText(await screen.findByTestId('code-input'), '123456');
    await fireEvent.press(screen.getByTestId('verify-code-button'));

    expect(api.passwordVerify).toHaveBeenCalledWith('driver@example.com', '123456');
    await screen.findByTestId('verify-code-button');
    expect(mockSignIn).toHaveBeenCalledWith(
      { accessToken: 'access', refreshToken: 'refresh' },
      signedIn.driver,
    );
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('says one thing for a wrong email or password', async () => {
    api.passwordSignIn.mockRejectedValue(new ApiError('InvalidCredentials', 401));
    await open(PASSWORD_ON);
    await fireEvent.changeText(await screen.findByTestId('identifier-input'), 'driver@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'wrong password');
    await fireEvent.press(screen.getByTestId('password-sign-in-button'));
    expect(await screen.findByText("That email or password isn't right.")).toBeTruthy();
    expect(screen.queryByTestId('code-input')).toBeNull();
  });

  it('keeps Sign in off until both are filled in', async () => {
    await open(PASSWORD_ON);
    const button = await screen.findByTestId('password-sign-in-button');
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'driver@example.com');
    expect(screen.getByTestId('password-sign-in-button').props.accessibilityState.disabled).toBe(
      true,
    );
    await fireEvent.changeText(screen.getByTestId('password-input'), 'x');
    expect(screen.getByTestId('password-sign-in-button').props.accessibilityState.disabled).toBe(
      false,
    );
  });

  it('still lets a driver with no password get a code the old way', async () => {
    api.requestOtp.mockResolvedValue(undefined);
    await open(PASSWORD_ON);
    await fireEvent.press(await screen.findByTestId('code-only-button'));
    await fireEvent.changeText(screen.getByTestId('identifier-input'), '07700900123');
    await fireEvent.press(screen.getByTestId('request-code-button'));
    expect(api.requestOtp).toHaveBeenCalledWith('07700900123', undefined);
  });
});

describe('creating an account', () => {
  async function openSignUp() {
    await open(PASSWORD_ON);
    await fireEvent.press(await screen.findByTestId('sign-up-button'));
  }

  it('will not send a code for a short password', async () => {
    await openSignUp();
    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'new@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'short');
    expect(screen.getByTestId('request-code-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/at least 10 characters/i)).toBeTruthy();
  });

  it('emails a code, then makes the account with the password and the code together', async () => {
    api.requestSignup.mockResolvedValue(undefined);
    api.confirmSignup.mockResolvedValue(signedIn);
    await openSignUp();

    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'new@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'three long words');
    await fireEvent.press(screen.getByTestId('request-code-button'));
    expect(api.requestSignup).toHaveBeenCalledWith('new@example.com', undefined);
    // The password has not gone to the server yet.
    expect(api.confirmSignup).not.toHaveBeenCalled();

    await fireEvent.changeText(await screen.findByTestId('code-input'), '654321');
    await fireEvent.press(screen.getByTestId('verify-code-button'));
    expect(api.confirmSignup).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'three long words',
      code: '654321',
      inviteCode: undefined,
    });
  });

  it('points a driver who already has an account to signing in', async () => {
    api.requestSignup.mockRejectedValue(new ApiError('AccountExists', 409));
    await openSignUp();
    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'old@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'three long words');
    await fireEvent.press(screen.getByTestId('request-code-button'));
    expect(await screen.findByText(/already an account for that email/)).toBeTruthy();
  });

  it('asks for the invite code only while the server requires one', async () => {
    await open({ ...PASSWORD_ON, inviteRequired: true });
    await fireEvent.press(await screen.findByTestId('sign-up-button'));
    expect(screen.getByTestId('invite-code-input')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'new@example.com');
    await fireEvent.changeText(screen.getByTestId('password-input'), 'three long words');
    expect(screen.getByTestId('request-code-button').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('invite-code-input'), 'ABC123');
    expect(screen.getByTestId('request-code-button').props.accessibilityState.disabled).toBe(false);
  });
});

describe('forgot password', () => {
  it('emails a code, then sets the new password with it and signs in', async () => {
    api.requestPasswordReset.mockResolvedValue(undefined);
    api.confirmPasswordReset.mockResolvedValue(signedIn);
    await open(PASSWORD_ON);
    await fireEvent.press(await screen.findByTestId('forgot-button'));

    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'driver@example.com');
    await fireEvent.press(screen.getByTestId('request-code-button'));
    expect(api.requestPasswordReset).toHaveBeenCalledWith('driver@example.com');

    await fireEvent.changeText(await screen.findByTestId('code-input'), '111222');
    // Too short: the button waits.
    await fireEvent.changeText(screen.getByTestId('new-password-input'), 'short');
    expect(screen.getByTestId('verify-code-button').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('new-password-input'), 'a brand new password');
    await fireEvent.press(screen.getByTestId('verify-code-button'));

    expect(api.confirmPasswordReset).toHaveBeenCalledWith({
      email: 'driver@example.com',
      code: '111222',
      newPassword: 'a brand new password',
    });
  });
});
