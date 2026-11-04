import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { useSignInOptions } from '../api/use-sign-in-options';
import { CodeOnlySignIn } from '../components/sign-in/code-only-sign-in';
import { ForgotPassword } from '../components/sign-in/forgot-password';
import { AuthScreen, ErrorText, LinkButton } from '../components/sign-in/form-kit';
import { PasswordSignIn } from '../components/sign-in/password-sign-in';
import { SignUp } from '../components/sign-in/sign-up';
import { useThemeColors } from '../theme/colors';

type Mode = 'signIn' | 'signUp' | 'forgot' | 'code';

/**
 * Signing in. The server says which ways in it offers (`GET /identity/sign-in-options`): with password sign-in on, an email and
 * password then an emailed code, a way to create an account and a way to reset the password, with the old code-only way kept for
 * a driver who has no password yet; with it off, the code-only screen as before.
 */
export default function SignInScreen() {
  const options = useSignInOptions();
  const colors = useThemeColors();
  const [mode, setMode] = useState<Mode>('signIn');

  if (options.isPending) {
    return (
      <AuthScreen>
        <ActivityIndicator color={colors.accent} />
      </AuthScreen>
    );
  }
  if (options.data === undefined) {
    return (
      <AuthScreen>
        <ErrorText>Couldn&apos;t reach the server. Check your connection.</ErrorText>
        <LinkButton
          label="Try again"
          onPress={() => void options.refetch()}
          testID="retry-options"
        />
      </AuthScreen>
    );
  }

  const { passwordSignIn, inviteRequired } = options.data;
  const goToSignIn = () => setMode('signIn');
  return (
    <AuthScreen>
      {!passwordSignIn ? (
        <CodeOnlySignIn inviteRequired={inviteRequired} />
      ) : mode === 'signUp' ? (
        <SignUp inviteRequired={inviteRequired} onBack={goToSignIn} />
      ) : mode === 'forgot' ? (
        <ForgotPassword onBack={goToSignIn} />
      ) : mode === 'code' ? (
        <CodeOnlySignIn inviteRequired={inviteRequired} onBack={goToSignIn} />
      ) : (
        <PasswordSignIn
          onSignUp={() => setMode('signUp')}
          onForgot={() => setMode('forgot')}
          onCodeOnly={() => setMode('code')}
        />
      )}
    </AuthScreen>
  );
}
