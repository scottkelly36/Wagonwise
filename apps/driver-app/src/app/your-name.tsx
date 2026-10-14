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

import { useSetDriverName } from '../api/use-identity';
import { ScreenHeader } from '../components/ui/screen-header';
import { identityErrorMessage } from '../lib/error-messages';
import { useAuthStore, type DriverInfo } from '../state/auth-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';

const MAX_NAME_LENGTH = 60;

/**
 * Your name: what the companies you drive for see instead of your phone number or email. Optional, and you can change
 * or clear it whenever you like. A company can also set its own name for you in its portal, which it sees first.
 */
export default function YourNameScreen() {
  const router = useRouter();
  const state = useAuthStore((s) => s.state);
  const setDriver = useAuthStore((s) => s.setDriver);
  const setName = useSetDriverName();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState(state.status === 'signedIn' ? (state.driver.name ?? '') : '');

  if (state.status !== 'signedIn') return null;
  const driver = state.driver;

  function handleSave(): void {
    if (setName.isPending) return;
    setName.mutate(text, {
      onSuccess: (updated) => {
        // Keep the cached driver in step, so More shows the new name without signing in again.
        const next: DriverInfo = {
          id: driver.id,
          identifier: driver.identifier,
          createdAt: driver.createdAt,
          ...(updated.name === undefined ? {} : { name: updated.name }),
          ...(driver.consentedAt === undefined ? {} : { consentedAt: driver.consentedAt }),
        };
        void setDriver(next);
        router.back();
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Your name" />
          <Text style={styles.hint}>
            This is what the companies you drive for see, instead of your phone number or email. You
            do not have to add one, and you can change or remove it at any time.
          </Text>

          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="For example: Dave Kelly"
            placeholderTextColor={colors.textDim}
            maxLength={MAX_NAME_LENGTH}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleSave}
            accessibilityLabel="Your name"
            testID="your-name-input"
          />

          {setName.isError && (
            <Text style={styles.error}>{identityErrorMessage(setName.error)}</Text>
          )}

          <TouchableOpacity
            style={[styles.button, setName.isPending && styles.buttonDisabled]}
            disabled={setName.isPending}
            onPress={handleSave}
            accessibilityRole="button"
            testID="your-name-save-button"
          >
            {setName.isPending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>Save</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { padding: 16, gap: 12 },
    hint: { fontSize: 16, color: colors.textMuted, marginBottom: 8 },
    input: {
      minHeight: 56,
      fontSize: 20,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
    },
    error: { fontSize: 16, color: colors.danger, marginTop: 8 },
    button: {
      minHeight: 56,
      backgroundColor: colors.accent,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { fontSize: 20, fontWeight: '700', color: colors.textOnAccent },
  });
}
