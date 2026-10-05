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

import { useJoinWithCode } from '../../api/use-fleet';
import { fleetErrorMessage } from '../../lib/error-messages';
import { ScreenHeader } from '../../components/ui/screen-header';
import { useThemeColors, type ThemeColors } from '../../theme/colors';

/** P2-M2.7: a driver asks to join with the code their company gave them. This only makes a
 *  request — the company still has to approve it on their own Drivers page before anything is
 *  granted (docs/history/p2-m2-driver-links.md). */
export default function JoinCompanyScreen() {
  const router = useRouter();
  const joinWithCode = useJoinWithCode();
  const [code, setCode] = useState('');
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function handleSubmit(): void {
    if (code.trim() === '' || joinWithCode.isPending) return;
    joinWithCode.mutate(code.trim(), { onSuccess: () => router.back() });
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Join a company" />
          <Text style={styles.hint}>
            Ask them for their join code. Entering it only sends a request — they still have to
            approve it.
          </Text>

          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            placeholder="ABCD-2345"
            placeholderTextColor={colors.textDim}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            testID="join-code-input"
          />

          {joinWithCode.isError && (
            <Text style={styles.error}>{fleetErrorMessage(joinWithCode.error)}</Text>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              (code.trim() === '' || joinWithCode.isPending) && styles.buttonDisabled,
            ]}
            disabled={code.trim() === '' || joinWithCode.isPending}
            onPress={handleSubmit}
            testID="join-code-submit-button"
          >
            {joinWithCode.isPending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>Request to join</Text>
            )}
          </TouchableOpacity>
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
      padding: 16,
      gap: 12,
    },
    hint: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 8,
    },
    input: {
      minHeight: 56,
      fontSize: 20,
      fontWeight: '600',
      letterSpacing: 2,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      textAlign: 'center',
    },
    error: {
      fontSize: 16,
      color: colors.danger,
      marginTop: 16,
      textAlign: 'center',
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
  });
}
