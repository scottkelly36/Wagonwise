import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useDeleteAccount } from '../api/use-identity';
import { useCurrentJob } from '../api/use-jobs';
import { identityErrorMessage } from '../lib/error-messages';
import { jobEntry } from '../lib/job-entry';
import { PRODUCT_NAME } from '../product';
import { useAuthStore } from '../state/auth-store';
import { useThemeStore, type ThemeMode } from '../state/theme-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';

const THEME_MODES: { readonly mode: ThemeMode; readonly label: string }[] = [
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
];

/** Everything that doesn't need to be on the map constantly (design decision, 2026-09-24) —
 *  reached from the small "Menu" icon on the map home screen, not the app's landing screen. */
export default function SettingsScreen() {
  const router = useRouter();
  const state = useAuthStore((s) => s.state);
  const signOut = useAuthStore((s) => s.signOut);
  const deleteAccount = useDeleteAccount();
  const currentJob = useCurrentJob();
  const job = jobEntry(currentJob);
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{PRODUCT_NAME}</Text>
        <Text style={styles.subtitle}>Signed in as {state.driver.identifier}</Text>

        <Text style={styles.sectionLabel}>My job</Text>
        {job.kind === 'job' ? (
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/job')}
            testID="my-job-button"
          >
            <Text style={styles.buttonText}>On job {job.reference} →</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.jobStatus}>
            <Text style={styles.jobStatusText} testID="my-job-status">
              {job.kind === 'checking'
                ? 'Checking for a job…'
                : job.kind === 'error'
                  ? "Couldn't check for a job. Check your signal and try again."
                  : 'No job assigned right now.'}
            </Text>
            {job.kind !== 'checking' && (
              <TouchableOpacity
                style={styles.smallButton}
                disabled={currentJob.isFetching}
                onPress={() => void currentJob.refetch()}
                testID="my-job-refresh-button"
              >
                <Text style={styles.themeButtonText}>
                  {currentJob.isFetching ? 'Checking…' : 'Check again'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Text style={styles.sectionLabel}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_MODES.map((option) => (
            <TouchableOpacity
              key={option.mode}
              style={[styles.themeButton, mode === option.mode && styles.themeButtonActive]}
              onPress={() => void setMode(option.mode)}
              testID={`theme-${option.mode}-button`}
            >
              <Text style={styles.themeButtonText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/profiles')}
          testID="vehicle-profiles-button"
        >
          <Text style={styles.buttonText}>Vehicle profiles</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/companies')}
          testID="companies-button"
        >
          <Text style={styles.buttonText}>My companies</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/voice-drafts')}
          testID="voice-drafts-button"
        >
          <Text style={styles.buttonText}>Saved reports</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => router.push('/feedback')}
          testID="feedback-button"
        >
          <Text style={styles.buttonText}>Feedback</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            void signOut().then(() => router.replace('/sign-in'));
          }}
          testID="sign-out-button"
        >
          <Text style={styles.buttonText}>Sign out</Text>
        </TouchableOpacity>

        {deleteAccount.isError && (
          <Text style={styles.error}>{identityErrorMessage(deleteAccount.error)}</Text>
        )}

        <TouchableOpacity
          style={[styles.deleteButton, deleteAccount.isPending && styles.buttonDisabled]}
          disabled={deleteAccount.isPending}
          onPress={handleDeleteAccount}
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
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      gap: 12,
    },
    title: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 18,
      color: colors.textSecondary,
      marginBottom: 24,
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
      alignSelf: 'flex-start',
      marginLeft: 4,
    },
    themeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    themeButton: {
      minHeight: 44,
      minWidth: 96,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 22,
      backgroundColor: colors.surface,
    },
    themeButtonActive: {
      backgroundColor: colors.surfaceStrong,
      borderWidth: 2,
      borderColor: colors.accentBlue,
    },
    themeButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    button: {
      minHeight: 56,
      minWidth: 200,
      backgroundColor: colors.surface,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    deleteButton: {
      minHeight: 56,
      minWidth: 200,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
    },
    jobStatus: {
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    jobStatusText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    smallButton: {
      minHeight: 44,
      minWidth: 140,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 22,
      backgroundColor: colors.surface,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    deleteButtonText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.danger,
    },
    error: {
      fontSize: 15,
      color: colors.danger,
      textAlign: 'center',
      marginTop: 12,
    },
  });
}
