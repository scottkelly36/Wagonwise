import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import * as identityApi from '../../api/identity';
import { looksLikeEmail, passwordProblem } from '../../lib/sign-in-form';
import { SIGN_UP_MESSAGES, signInErrorMessage } from '../../lib/sign-in-errors';
import { CodeStep } from './code-step';
import {
  ErrorText,
  Field,
  Heading,
  Hint,
  LinkButton,
  PasswordField,
  PrimaryButton,
} from './form-kit';
import { useFinishSignIn } from './use-finish-sign-in';

/**
 * Make an account with an email and a password. We email a code first to prove the address is theirs; the password is sent only with
 * the code, so nobody can set one on someone else's address. An invite code is asked for only while the server still requires one.
 */
export function SignUp({
  inviteRequired,
  onBack,
}: {
  readonly inviteRequired: boolean;
  readonly onBack: () => void;
}) {
  const finish = useFinishSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [sentTo, setSentTo] = useState<string | undefined>(undefined);

  const invite = inviteRequired ? inviteCode.trim() || undefined : undefined;
  const problem = password === '' ? undefined : passwordProblem(password, email);

  const request = useMutation({
    mutationFn: () => identityApi.requestSignup(email.trim(), invite),
    onSuccess: () => setSentTo(email.trim()),
  });

  const confirm = useMutation({
    mutationFn: (code: string) =>
      identityApi.confirmSignup({ email: email.trim(), password, code, inviteCode: invite }),
    onSuccess: finish,
  });

  if (sentTo !== undefined) {
    return (
      <CodeStep
        sentTo={sentTo}
        submitLabel="Create my account"
        busy={confirm.isPending}
        error={confirm.isError ? signInErrorMessage(confirm.error, SIGN_UP_MESSAGES) : undefined}
        onSubmit={(code) => confirm.mutate(code)}
        backLabel="Use a different email"
        onBack={() => {
          confirm.reset();
          setSentTo(undefined);
        }}
      />
    );
  }

  const ready =
    looksLikeEmail(email) &&
    passwordProblem(password, email) === undefined &&
    (!inviteRequired || inviteCode.trim() !== '');
  return (
    <>
      <Heading>Create an account</Heading>
      <Hint>We will email you a code to check the address is yours.</Hint>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        testID="identifier-input"
      />
      <PasswordField
        isNew
        label="Choose a password"
        value={password}
        onChangeText={setPassword}
        testID="password-input"
      />
      {problem !== undefined ? <Hint>{problem}</Hint> : <Hint>At least 10 characters.</Hint>}

      {inviteRequired && (
        <Field
          label="Invite code"
          value={inviteCode}
          onChangeText={setInviteCode}
          autoCapitalize="none"
          autoCorrect={false}
          testID="invite-code-input"
        />
      )}

      {request.isError && (
        <ErrorText testID="sign-up-error">
          {signInErrorMessage(request.error, SIGN_UP_MESSAGES)}
        </ErrorText>
      )}

      <PrimaryButton
        label="Send me a code"
        disabled={!ready}
        busy={request.isPending}
        onPress={() => request.mutate()}
        testID="request-code-button"
      />
      <LinkButton label="I already have an account" onPress={onBack} testID="back-to-sign-in" />
    </>
  );
}
