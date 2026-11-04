import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PRODUCT_NAME } from '../../product';
import { useThemeColors, type ThemeColors } from '../../theme/colors';

/**
 * The pieces the sign-in screens are built from: a frame, labelled fields, a big button, a quiet link. One look for sign-in, sign-up,
 * forgot password and the two "add to your account" screens, so a change to the look is made once.
 */

function useStyles() {
  const colors = useThemeColors();
  return { colors, styles: useMemo(() => createStyles(colors), [colors]) };
}

/** The signed-out frame: the product name, then whatever the step is. */
export function AuthScreen({ children }: { children: ReactNode }) {
  const { styles } = useStyles();
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{PRODUCT_NAME}</Text>
          {children}
          <Text style={styles.footnote}>
            This is a planning aid — road signs and your own judgement always come first.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const { styles } = useStyles();
  return <Text style={styles.heading}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }) {
  const { styles } = useStyles();
  return <Text style={styles.hint}>{children}</Text>;
}

export function ErrorText({ children, testID }: { children: ReactNode; testID?: string }) {
  const { styles } = useStyles();
  return (
    <Text style={styles.error} accessibilityRole="alert" testID={testID}>
      {children}
    </Text>
  );
}

interface FieldProps extends TextInputProps {
  readonly label: string;
}

export function Field({ label, ...input }: FieldProps) {
  const { colors, styles } = useStyles();
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={colors.textDim}
        accessibilityLabel={label}
        {...input}
      />
    </>
  );
}

/** A password box with Show and Hide: a long password is hard to get right on a phone keyboard unseen. */
export function PasswordField({
  label,
  isNew,
  ...input
}: FieldProps & { readonly isNew?: boolean }) {
  const { colors, styles } = useStyles();
  const [shown, setShown] = useState(false);
  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          placeholderTextColor={colors.textDim}
          accessibilityLabel={label}
          secureTextEntry={!shown}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={isNew === true ? 'new-password' : 'current-password'}
          textContentType={isNew === true ? 'newPassword' : 'password'}
          {...input}
        />
        <TouchableOpacity
          style={styles.showButton}
          onPress={() => setShown((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={shown ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.linkText}>{shown ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly testID?: string;
}) {
  const { colors, styles } = useStyles();
  const off = disabled === true || busy === true;
  return (
    <TouchableOpacity
      style={[styles.button, disabled === true && styles.buttonDisabled]}
      disabled={off}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: busy === true }}
      testID={testID}
    >
      {busy === true ? (
        <ActivityIndicator color={colors.textOnAccent} />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function LinkButton({
  label,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const { styles } = useStyles();
  return (
    <TouchableOpacity
      style={styles.linkButton}
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
    >
      <Text style={styles.linkText}>{label}</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    content: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 8 },
    title: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 16,
      textAlign: 'center',
    },
    heading: { fontSize: 22, fontWeight: '700', color: colors.text, marginTop: 8 },
    hint: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
    label: { fontSize: 16, color: colors.textMuted, marginTop: 16 },
    input: {
      minHeight: 56,
      fontSize: 20,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      marginTop: 8,
    },
    passwordRow: { flexDirection: 'row', alignItems: 'center' },
    passwordInput: { flex: 1 },
    showButton: { minHeight: 56, minWidth: 64, justifyContent: 'center', alignItems: 'center' },
    button: {
      minHeight: 56,
      backgroundColor: colors.accent,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { fontSize: 20, fontWeight: '700', color: colors.textOnAccent },
    linkButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
    linkText: { fontSize: 16, color: colors.textMuted, textDecorationLine: 'underline' },
    error: { fontSize: 16, color: colors.danger, marginTop: 12 },
    footnote: { fontSize: 13, color: colors.textDim, textAlign: 'center', marginTop: 32 },
  });
}
