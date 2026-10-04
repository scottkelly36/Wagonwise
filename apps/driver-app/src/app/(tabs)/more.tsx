import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDeleteAccount } from '../../api/use-identity';
import { Icon, type IconName } from '../../components/ui/icon';
import { identityErrorMessage } from '../../lib/error-messages';
import { PRODUCT_NAME } from '../../product';
import { useAuthStore } from '../../state/auth-store';
import { useThemeStore, type ThemeMode } from '../../state/theme-store';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle, radius } from '../../theme/tokens';

const THEME_MODES: { readonly mode: ThemeMode; readonly label: string; readonly icon: IconName }[] =
  [
    { mode: 'light', label: 'Light', icon: 'white-balance-sunny' },
    { mode: 'dark', label: 'Dark', icon: 'weather-night' },
  ];

interface MenuRow {
  readonly label: string;
  readonly icon: IconName;
  readonly href: Href;
  readonly testID: string;
}

const ROWS: readonly MenuRow[] = [
  {
    label: 'Vehicle profiles',
    icon: 'truck-outline',
    href: '/profiles',
    testID: 'vehicle-profiles-button',
  },
  {
    label: 'My companies',
    icon: 'office-building-outline',
    href: '/companies',
    testID: 'companies-button',
  },
  { label: 'Feedback', icon: 'message-text-outline', href: '/feedback', testID: 'feedback-button' },
];

/** Everything that doesn't need to be on the map or in a tab of its own: vehicles, companies,
 *  appearance, feedback and the account. (Redesign, 2026-10-04: the old Settings list, now the More
 *  tab; saved reports and the current job moved to their own tabs.) */
export default function MoreScreen() {
  const router = useRouter();
  const state = useAuthStore((s) => s.state);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useDeleteAccount();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (state.status !== 'signedIn') {
    return null;
  }

  function handleDeleteAccount(): void {
    Alert.alert(
      'Delete your account?',
      'This removes your account and everything tied to it. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAccount.mutate(undefined, {
              onSuccess: () => {
                void signOut().then(() => router.replace('/sign-in'));
              },
            });
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>More</Text>
        <Text style={styles.subtitle}>
          {PRODUCT_NAME} · signed in as {state.driver.identifier}
        </Text>

        <View style={styles.group}>
          {ROWS.map((row, index) => (
            <TouchableOpacity
              key={row.testID}
              style={[styles.row, index > 0 && styles.rowDivider]}
              onPress={() => router.push(row.href)}
              accessibilityRole="button"
              testID={row.testID}
            >
              <View style={styles.rowIcon}>
                <Icon name={row.icon} size={26} color={colors.accent} />
              </View>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Icon name="chevron-right" size={26} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_MODES.map((option) => {
            const active = mode === option.mode;
            return (
              <TouchableOpacity
                key={option.mode}
                style={[styles.themeButton, active && styles.themeButtonActive]}
                onPress={() => void setMode(option.mode)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`theme-${option.mode}-button`}
              >
                <Icon
                  name={option.icon}
                  size={24}
                  color={active ? colors.textOnAccent : colors.text}
                />
                <Text style={[styles.themeButtonText, active && styles.themeButtonTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.group}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              void signOut().then(() => router.replace('/sign-in'));
            }}
            accessibilityRole="button"
            testID="sign-out-button"
          >
            <View style={styles.rowIcon}>
              <Icon name="logout" size={26} color={colors.accent} />
            </View>
            <Text style={styles.rowLabel}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {deleteAccount.isError && (
          <Text style={styles.error}>{identityErrorMessage(deleteAccount.error)}</Text>
        )}

        <TouchableOpacity
          style={[styles.deleteButton, deleteAccount.isPending && styles.disabled]}
          disabled={deleteAccount.isPending}
          onPress={handleDeleteAccount}
          accessibilityRole="button"
          testID="delete-account-button"
        >
          {deleteAccount.isPending ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete account</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 16, gap: 16 },
    title: { fontSize: 32, fontWeight: '800', color: colors.text },
    subtitle: { fontSize: 16, color: colors.textMuted, marginTop: -8 },
    group: { ...cardStyle(colors), overflow: 'hidden' },
    row: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 14,
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
    rowIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowLabel: { flex: 1, fontSize: 18, fontWeight: '600', color: colors.text },
    sectionLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginLeft: 4,
      marginBottom: -6,
    },
    themeRow: { flexDirection: 'row', gap: 12 },
    themeButton: {
      ...cardStyle(colors),
      flex: 1,
      minHeight: 60,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
    },
    themeButtonActive: { backgroundColor: colors.accent },
    themeButtonText: { fontSize: 17, fontWeight: '600', color: colors.text },
    themeButtonTextActive: { color: colors.textOnAccent },
    deleteButton: {
      minHeight: 56,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: radius.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
    },
    deleteButtonText: { fontSize: 18, fontWeight: '600', color: colors.danger },
    disabled: { opacity: 0.5 },
    error: { fontSize: 15, color: colors.danger, textAlign: 'center' },
  });
}
