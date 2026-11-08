import { act, fireEvent, render, screen } from '@testing-library/react-native';

import AddEmailScreen from '../app/add-email';
import SetPasswordScreen from '../app/set-password';
import { ApiError } from '../api/errors';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, canGoBack: () => true, replace: jest.fn() }),
}));

const mockSetDriver = jest.fn();
let mockIdentifier = 'driver@example.com';
jest.mock('../state/auth-store', () => ({
  useAuthStore: (select: (s: unknown) => unknown) =>
    select({
      state: {
        status: 'signedIn',
        driver: { id: 'd1', identifier: mockIdentifier, createdAt: '2026-11-01T09:00:00.000Z' },
      },
      setDriver: mockSetDriver,
    }),
}));

const mockSetPassword = jest.fn();
const mockRequestEmail = jest.fn();
const mockConfirmEmail = jest.fn();
const mockIdle = { isPending: false, isError: false, error: null, reset: jest.fn() };
let mockSetPasswordState: object = mockIdle;
let mockConfirmState: object = mockIdle;
jest.mock('../api/use-identity', () => ({
  useSetPassword: () => ({ ...mockSetPasswordState, mutate: mockSetPassword }),
  useRequestAddEmail: () => ({ ...mockIdle, mutate: mockRequestEmail }),
  useConfirmAddEmail: () => ({ ...mockConfirmState, mutate: mockConfirmEmail }),
}));

// The first render in a file loads the React Native modules, which can pass Jest's 5 s default on a busy runner.
jest.setTimeout(30_000);

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentifier = 'driver@example.com';
  mockSetPasswordState = mockIdle;
  mockConfirmState = mockIdle;
});

describe('the Password screen', () => {
  it('keeps Save off until the password is long enough, then saves and says so', async () => {
    await render(<SetPasswordScreen />);
    expect(screen.getByTestId('save-password-button').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('password-input'), 'three long words');
    expect(screen.getByTestId('save-password-button').props.accessibilityState.disabled).toBe(
      false,
    );
    await fireEvent.press(screen.getByTestId('save-password-button'));

    expect(mockSetPassword).toHaveBeenCalledTimes(1);
    const [password, options] = mockSetPassword.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    expect(password).toBe('three long words');
    await act(async () => {
      options.onSuccess();
    });
    expect(await screen.findByTestId('password-saved')).toBeTruthy();
  });

  it('refuses the email as the password', async () => {
    await render(<SetPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId('password-input'), 'driver@example.com');
    expect(screen.getByTestId('save-password-button').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText("Your password can't be the same as your email.")).toBeTruthy();
  });

  it('tells a driver who already has one how to change it', async () => {
    mockSetPasswordState = {
      ...mockIdle,
      isError: true,
      error: new ApiError('PasswordAlreadySet', 409),
    };
    await render(<SetPasswordScreen />);
    expect(await screen.findByText(/already have a password/)).toBeTruthy();
  });
});

describe('the Add your email screen', () => {
  beforeEach(() => {
    mockIdentifier = '+447700900123';
  });

  it('emails a code, then confirms it and keeps the new sign-in on the account', async () => {
    await render(<AddEmailScreen />);
    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'new@example.com');
    await fireEvent.press(screen.getByTestId('request-code-button'));

    expect(mockRequestEmail).toHaveBeenCalledTimes(1);
    const [email, requestOptions] = mockRequestEmail.mock.calls[0] as [
      string,
      { onSuccess: () => void },
    ];
    expect(email).toBe('new@example.com');
    await act(async () => {
      requestOptions.onSuccess();
    });

    await fireEvent.changeText(await screen.findByTestId('code-input'), '123456');
    await fireEvent.press(screen.getByTestId('verify-code-button'));
    expect(mockConfirmEmail).toHaveBeenCalledTimes(1);
    const [input, confirmOptions] = mockConfirmEmail.mock.calls[0] as [
      { email: string; code: string },
      { onSuccess: (driver: { identifier: string }) => void },
    ];
    expect(input).toEqual({ email: 'new@example.com', code: '123456' });

    await act(async () => {
      confirmOptions.onSuccess({ identifier: 'new@example.com' });
    });
    expect(mockSetDriver).toHaveBeenCalledWith({
      id: 'd1',
      identifier: 'new@example.com',
      createdAt: '2026-11-01T09:00:00.000Z',
    });
    expect(mockBack).toHaveBeenCalled();
  });

  it('says when the email belongs to another account', async () => {
    mockConfirmState = mockIdle;
    await render(<AddEmailScreen />);
    await fireEvent.changeText(screen.getByTestId('identifier-input'), 'taken@example.com');
    await fireEvent.press(screen.getByTestId('request-code-button'));
    const [, options] = mockRequestEmail.mock.calls[0] as [string, { onSuccess: () => void }];
    mockConfirmState = {
      ...mockIdle,
      isError: true,
      error: new ApiError('AccountExists', 409),
    };
    await act(async () => {
      options.onSuccess();
    });
    expect(await screen.findByText('That email already belongs to another account.')).toBeTruthy();
  });
});
