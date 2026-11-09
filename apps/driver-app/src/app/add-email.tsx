import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConfirmAddEmail, useRequestAddEmail } from '../api/use-identity';
import { CodeStep } from '../components/sign-in/code-step';
import { ErrorText, Field, Hint, PrimaryButton } from '../components/sign-in/form-kit';
import { useEmailReview } from '../components/sign-in/use-email-review';
import { ScreenHeader } from '../components/ui/screen-header';
import { ADD_EMAIL_MESSAGES, signInErrorMessage } from '../lib/sign-in-errors';
import { looksLikeEmail } from '../lib/sign-in-form';
import { useAuthStore, type DriverInfo } from '../state/auth-store';
import { useThemeColors } from '../theme/colors';

/**
 * Add an email to an account made with a phone number. Signing in with a password sends its code by email, so a phone-number
 * account needs one first. The account stays the same one: its vehicles, routes and companies come with it, and the email replaces
 * the phone number as the way to sign in.
 */
export default function AddEmailScreen() {
  const router = useRouter();
  const state = useAuthStore((s) => s.state);
  const setDriver = useAuthStore((s) => s.setDriver);
  const request = useRequestAddEmail();
  const confirm = useConfirmAddEmail();
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | undefined>(undefined);
  const emailReview = useEmailReview(email, setEmail);

  if (state.status !== 'signedIn') return null;
  const driver = state.driver;

  function handleConfirm(code: string): void {
    if (sentTo === undefined) return;
    confirm.mutate(
      { email: sentTo, code },
      {
        onSuccess: (updated) => {
          // The email is now the sign-in; keep the cached driver in step so More shows it without signing in again.
          const next: DriverInfo = {
            id: driver.id,
            identifier: updated.identifier,
            createdAt: driver.createdAt,
            ...(driver.name === undefined ? {} : { name: driver.name }),
            ...(driver.consentedAt === undefined ? {} : { consentedAt: driver.consentedAt }),
          };
          void setDriver(next);
          router.back();
        },
      },
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Add your email" fallbackHref="/more" />
          {sentTo !== undefined ? (
            <CodeStep
              sentTo={sentTo}
              submitLabel="Confirm email"
              busy={confirm.isPending}
              error={
                confirm.isError ? signInErrorMessage(confirm.error, ADD_EMAIL_MESSAGES) : undefined
              }
              onSubmit={handleConfirm}
              backLabel="Use a different email"
              onBack={() => {
                confirm.reset();
                setSentTo(undefined);
              }}
            />
          ) : (
            <>
              <Hint>
                You signed up with a phone number. Add an email to sign in with an email, a password
                and a code. Everything on your account stays as it is.
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
              {emailReview.prompt}
              {request.isError && (
                <ErrorText testID="add-email-error">
                  {signInErrorMessage(request.error, ADD_EMAIL_MESSAGES)}
                </ErrorText>
              )}
              <PrimaryButton
                label="Send me a code"
                disabled={!looksLikeEmail(email)}
                busy={request.isPending}
                onPress={() =>
                  emailReview.review(() =>
                    request.mutate(email.trim(), { onSuccess: () => setSentTo(email.trim()) }),
                  )
                }
                testID="request-code-button"
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 20, gap: 8 },
});
