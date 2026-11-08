import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import * as identityApi from '../../api/identity';
import {
  REQUEST_OTP_MESSAGES,
  signInErrorMessage,
  VERIFY_OTP_MESSAGES,
} from '../../lib/sign-in-errors';
import { CodeStep } from './code-step';
import { ErrorText, Field, Heading, Hint, LinkButton, PrimaryButton } from './form-kit';
import { useFinishSignIn } from './use-finish-sign-in';

type Step =
  | { readonly kind: 'identifier' }
  | { readonly kind: 'code'; readonly identifier: string; readonly inviteCode: string | undefined };

/**
 * Sign in with an email or mobile number and a code, no password: the way in until now, and still the way for a driver who has no
 * password. The invite box is shown only while the server asks for a code on a first sign-in.
 */
export function CodeOnlySignIn({
  inviteRequired,
  onBack,
}: {
  readonly inviteRequired: boolean;
  /** Present when there is a password screen to go back to. */
  readonly onBack?: () => void;
}) {
  const finish = useFinishSignIn();
  const [step, setStep] = useState<Step>({ kind: 'identifier' });
  const [identifier, setIdentifier] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const invite = inviteRequired ? inviteCode.trim() || undefined : undefined;

  const requestOtp = useMutation({
    mutationFn: () => identityApi.requestOtp(identifier.trim(), invite),
    onSuccess: () => setStep({ kind: 'code', identifier: identifier.trim(), inviteCode: invite }),
  });

  const verifyOtp = useMutation({
    mutationFn: (code: string) => {
      if (step.kind !== 'code') return Promise.reject(new Error('not ready to verify a code yet'));
      return identityApi.verifyOtp(step.identifier, code, step.inviteCode);
    },
    onSuccess: finish,
  });

  if (step.kind === 'code') {
    return (
      <CodeStep
        sentTo={step.identifier}
        submitLabel="Continue"
        busy={verifyOtp.isPending}
        error={
          verifyOtp.isError ? signInErrorMessage(verifyOtp.error, VERIFY_OTP_MESSAGES) : undefined
        }
        onSubmit={(code) => verifyOtp.mutate(code)}
        backLabel="Use a different email or number"
        onBack={() => {
          verifyOtp.reset();
          setStep({ kind: 'identifier' });
        }}
      />
    );
  }

  return (
    <>
      {onBack !== undefined && <Heading>Get a code instead</Heading>}
      {onBack !== undefined && (
        <Hint>For an account with no password. We send a code to your email or mobile.</Hint>
      )}
      <Field
        label="Email or mobile number"
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="you@example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        testID="identifier-input"
      />

      {inviteRequired && (
        <Field
          label="Invite code (first sign-in only)"
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="Leave blank if you've signed in before"
          autoCapitalize="none"
          autoCorrect={false}
          testID="invite-code-input"
        />
      )}

      {requestOtp.isError && (
        <ErrorText>{signInErrorMessage(requestOtp.error, REQUEST_OTP_MESSAGES)}</ErrorText>
      )}

      <PrimaryButton
        label="Send me a code"
        disabled={!identifier.trim()}
        busy={requestOtp.isPending}
        onPress={() => requestOtp.mutate()}
        testID="request-code-button"
      />
      {onBack !== undefined && <LinkButton label="Back to sign in" onPress={onBack} />}
    </>
  );
}
