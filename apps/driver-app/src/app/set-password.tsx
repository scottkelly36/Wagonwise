import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSetPassword } from '../api/use-identity';
import { ErrorText, Hint, PasswordField, PrimaryButton } from '../components/sign-in/form-kit';
import { ScreenHeader } from '../components/ui/screen-header';
import { SET_PASSWORD_MESSAGES, signInErrorMessage } from '../lib/sign-in-errors';
import { passwordProblem } from '../lib/sign-in-form';
import { useAuthStore } from '../state/auth-store';
import { useThemeColors } from '../theme/colors';

/**
 * Add a password to an account that has none, so signing in asks for it as well as a code. Once an account has a password the
 * code-only way in is closed for it, so a code sent to an inbox someone else can read no longer gets in on its own.
 */
export default function SetPasswordScreen() {
  const router = useRouter();
  const state = useAuthStore((s) => s.state);
  const setPassword = useSetPassword();
  const colors = useThemeColors();
  const [password, setPasswordText] = useState('');
  const [done, setDone] = useState(false);

  if (state.status !== 'signedIn') return null;
  const identifier = state.driver.identifier;
  const problem = password === '' ? undefined : passwordProblem(password, identifier);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Password" fallbackHref="/more" />
          {done ? (
            <>
              <Text style={[styles.done, { color: colors.accentGreen }]} testID="password-saved">
                Your password is saved.
              </Text>
              <Hint>
                Next time you sign in you will type your email and this password, then a code we
                email you.
              </Hint>
              <PrimaryButton label="Done" onPress={() => router.back()} testID="password-done" />
            </>
          ) : (
            <>
              <Hint>
                Add a password to sign in with your email and password, then a code we email you.
                Once you have one, a code on its own no longer signs you in.
              </Hint>
              <PasswordField
                isNew
                label="Choose a password"
                value={password}
                onChangeText={setPasswordText}
                testID="password-input"
              />
              <Hint>{problem ?? 'At least 10 characters.'}</Hint>
              {setPassword.isError && (
                <ErrorText testID="set-password-error">
                  {signInErrorMessage(setPassword.error, SET_PASSWORD_MESSAGES)}
                </ErrorText>
              )}
              <PrimaryButton
                label="Save password"
                disabled={passwordProblem(password, identifier) !== undefined}
                busy={setPassword.isPending}
                onPress={() => setPassword.mutate(password, { onSuccess: () => setDone(true) })}
                testID="save-password-button"
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
  done: { fontSize: 20, fontWeight: '700', marginTop: 16 },
});
