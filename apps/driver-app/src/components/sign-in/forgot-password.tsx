import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import * as identityApi from '../../api/identity';
import { looksLikeEmail, passwordProblem } from '../../lib/sign-in-form';
import { RESET_PASSWORD_MESSAGES, signInErrorMessage } from '../../lib/sign-in-errors';
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
 * Forgot your password: an emailed code, then the code and a new password, which signs you in. The first step answers the same
 * whether or not the address has an account, so it can't be used to find out who does.
 */
export function ForgotPassword({ onBack }: { readonly onBack: () => void }) {
  const finish = useFinishSignIn();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sentTo, setSentTo] = useState<string | undefined>(undefined);

  const request = useMutation({
    mutationFn: () => identityApi.requestPasswordReset(email.trim()),
    onSuccess: () => setSentTo(email.trim()),
  });

  const confirm = useMutation({
    mutationFn: (code: string) =>
      identityApi.confirmPasswordReset({ email: email.trim(), code, newPassword }),
    onSuccess: finish,
  });

  if (sentTo !== undefined) {
    const problem = newPassword === '' ? undefined : passwordProblem(newPassword, sentTo);
    return (
      <CodeStep
        sentTo={sentTo}
        submitLabel="Set my password and sign in"
        busy={confirm.isPending}
        error={
          confirm.isError ? signInErrorMessage(confirm.error, RESET_PASSWORD_MESSAGES) : undefined
        }
        onSubmit={(code) => confirm.mutate(code)}
        extra={
          <>
            <PasswordField
              isNew
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              testID="new-password-input"
            />
            <Hint>{problem ?? 'At least 10 characters.'}</Hint>
          </>
        }
        extraReady={passwordProblem(newPassword, sentTo) === undefined}
        backLabel="Use a different email"
        onBack={() => {
          confirm.reset();
          setSentTo(undefined);
        }}
      />
    );
  }

  return (
    <>
      <Heading>Forgot your password?</Heading>
      <Hint>
        Enter your email. If there is an account for it, we will send a code to choose a new
        password.
      </Hint>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        testID="identifier-input"
      />
      {request.isError && (
        <ErrorText>{signInErrorMessage(request.error, RESET_PASSWORD_MESSAGES)}</ErrorText>
      )}
      <PrimaryButton
        label="Send me a code"
        disabled={!looksLikeEmail(email)}
        busy={request.isPending}
        onPress={() => request.mutate()}
        testID="request-code-button"
      />
      <LinkButton label="Back to sign in" onPress={onBack} />
    </>
  );
}
