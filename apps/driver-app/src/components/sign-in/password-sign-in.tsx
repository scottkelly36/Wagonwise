import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import * as identityApi from '../../api/identity';
import {
  PASSWORD_SIGN_IN_MESSAGES,
  signInErrorMessage,
  VERIFY_OTP_MESSAGES,
} from '../../lib/sign-in-errors';
import { CodeStep } from './code-step';
import { ErrorText, Field, Heading, LinkButton, PasswordField, PrimaryButton } from './form-kit';
import { useFinishSignIn } from './use-finish-sign-in';

/**
 * Sign in with an email (or the mobile number a driver signed up with) and a password; a right password sends a code to the
 * email, and the code finishes it. A wrong email and a wrong password give the same answer, so neither is given away.
 */
export function PasswordSignIn({
  onSignUp,
  onForgot,
  onCodeOnly,
}: {
  readonly onSignUp: () => void;
  readonly onForgot: () => void;
  readonly onCodeOnly: () => void;
}) {
  const finish = useFinishSignIn();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | undefined>(undefined);

  const signIn = useMutation({
    mutationFn: () => identityApi.passwordSignIn(identifier.trim(), password),
    onSuccess: () => setSentTo(identifier.trim()),
  });

  const verify = useMutation({
    mutationFn: (code: string) => identityApi.passwordVerify(identifier.trim(), code),
    onSuccess: finish,
  });

  if (sentTo !== undefined) {
    return (
      <CodeStep
        sentTo={sentTo}
        submitLabel="Continue"
        busy={verify.isPending}
        error={verify.isError ? signInErrorMessage(verify.error, VERIFY_OTP_MESSAGES) : undefined}
        onSubmit={(code) => verify.mutate(code)}
        backLabel="Back"
        onBack={() => {
          verify.reset();
          setSentTo(undefined);
        }}
      />
    );
  }

  const ready = identifier.trim() !== '' && password !== '';
  return (
    <>
      <Heading>Sign in</Heading>
      <Field
        label="Email"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        testID="identifier-input"
      />
      <PasswordField
        label="Password"
        value={password}
        onChangeText={setPassword}
        returnKeyType="go"
        onSubmitEditing={() => ready && !signIn.isPending && signIn.mutate()}
        testID="password-input"
      />

      {signIn.isError && (
        <ErrorText testID="sign-in-error">
          {signInErrorMessage(signIn.error, PASSWORD_SIGN_IN_MESSAGES)}
        </ErrorText>
      )}

      <PrimaryButton
        label="Sign in"
        disabled={!ready}
        busy={signIn.isPending}
        onPress={() => signIn.mutate()}
        testID="password-sign-in-button"
      />
      <LinkButton label="Forgot your password?" onPress={onForgot} testID="forgot-button" />
      <LinkButton label="Create an account" onPress={onSignUp} testID="sign-up-button" />
      <LinkButton
        label="No password yet? Get a code instead"
        onPress={onCodeOnly}
        testID="code-only-button"
      />
    </>
  );
}
