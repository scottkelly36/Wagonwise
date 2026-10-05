import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as identityApi from '../api/identity';
import { ApiError } from '../api/errors';
import { PRODUCT_NAME } from '../product';
import { useAuthStore } from '../state/auth-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';

type Step =
  | { readonly kind: 'identifier' }
  | { readonly kind: 'code'; readonly identifier: string; readonly inviteCode: string | undefined };

const REQUEST_OTP_MESSAGES: Record<string, string> = {
  InvalidIdentifier: 'Enter a valid email address or phone number.',
  InviteCodeRequired: "You'll need an invite code the first time you sign in.",
  InvalidInviteCode: "That invite code isn't recognised.",
};

const VERIFY_OTP_MESSAGES: Record<string, string> = {
  ...REQUEST_OTP_MESSAGES,
  OtpNotFound: 'Request a new code.',
  OtpAlreadyConsumed: "That code's already been used — request a new one.",
  OtpExpired: "That code's expired — request a new one.",
  TooManyAttempts: 'Too many attempts. Request a new code.',
};

function errorMessage(error: unknown, messages: Record<string, string>): string {
  if (error instanceof ApiError) {
    if (error.tag === 'OtpIncorrect') {
      const remaining = error.attemptsRemaining;
      return remaining === undefined
        ? 'Wrong code.'
        : `Wrong code. ${remaining} attempt${remaining === 1 ? '' : 's'} left.`;
    }
    return messages[error.tag] ?? 'Something went wrong. Try again.';
  }
  return "Couldn't reach the server. Check your connection.";
}

export default function SignInScreen() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);

  const [step, setStep] = useState<Step>({ kind: 'identifier' });
  const [identifier, setIdentifier] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [code, setCode] = useState('');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const requestOtpMutation = useMutation({
    mutationFn: () => identityApi.requestOtp(identifier.trim(), inviteCode.trim() || undefined),
    onSuccess: () => {
      setStep({
        kind: 'code',
        identifier: identifier.trim(),
        inviteCode: inviteCode.trim() || undefined,
      });
      setCode('');
    },
  });

  const verifyOtpMutation = useMutation({
    mutationFn: () => {
      if (step.kind !== 'code') {
        return Promise.reject(new Error('not ready to verify a code yet'));
      }
      return identityApi.verifyOtp(step.identifier, code.trim(), step.inviteCode);
    },
    onSuccess: async (result) => {
      await signIn(
        { accessToken: result.accessToken, refreshToken: result.refreshToken },
        result.driver,
      );
      router.replace('/home');
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{PRODUCT_NAME}</Text>

          {step.kind === 'identifier' ? (
            <>
              <Text style={styles.label}>Email or mobile number</Text>
              <TextInput
                style={styles.input}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="you@example.com"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                testID="identifier-input"
              />

              <Text style={styles.label}>Invite code (first sign-in only)</Text>
              <TextInput
                style={styles.input}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="Leave blank if you've signed in before"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
                testID="invite-code-input"
              />

              {requestOtpMutation.isError && (
                <Text style={styles.error}>
                  {errorMessage(requestOtpMutation.error, REQUEST_OTP_MESSAGES)}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.button, !identifier.trim() && styles.buttonDisabled]}
                disabled={!identifier.trim() || requestOtpMutation.isPending}
                onPress={() => requestOtpMutation.mutate()}
                testID="request-code-button"
              >
                {requestOtpMutation.isPending ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <Text style={styles.buttonText}>Send me a code</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>A code has been sent to {step.identifier}</Text>

              <Text style={styles.label}>Enter the code</Text>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={colors.textDim}
                keyboardType="number-pad"
                testID="code-input"
              />

              {verifyOtpMutation.isError && (
                <Text style={styles.error}>
                  {errorMessage(verifyOtpMutation.error, VERIFY_OTP_MESSAGES)}
                </Text>
              )}

              <TouchableOpacity
                style={[styles.button, !code.trim() && styles.buttonDisabled]}
                disabled={!code.trim() || verifyOtpMutation.isPending}
                onPress={() => verifyOtpMutation.mutate()}
                testID="verify-code-button"
              >
                {verifyOtpMutation.isPending ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <Text style={styles.buttonText}>Continue</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.linkButton}
                onPress={() => setStep({ kind: 'identifier' })}
                testID="use-different-identifier-button"
              >
                <Text style={styles.linkText}>Use a different email or number</Text>
              </TouchableOpacity>
            </>
          )}

          <Text style={styles.footnote}>
            This is a planning aid — road signs and your own judgement always come first.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 8,
    },
    title: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 24,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 18,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    label: {
      fontSize: 16,
      color: colors.textMuted,
      marginTop: 16,
    },
    input: {
      minHeight: 56,
      fontSize: 20,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      marginTop: 8,
    },
    button: {
      minHeight: 56,
      backgroundColor: colors.accent,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    linkButton: {
      minHeight: 56,
      justifyContent: 'center',
      alignItems: 'center',
    },
    linkText: {
      fontSize: 16,
      color: colors.textMuted,
      textDecorationLine: 'underline',
    },
    error: {
      fontSize: 16,
      color: colors.danger,
      marginTop: 12,
    },
    footnote: {
      fontSize: 13,
      color: colors.textDim,
      textAlign: 'center',
      marginTop: 32,
    },
  });
}
