import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useConfirmHazard,
  useDeleteHazard,
  useDismissHazard,
  useHazard,
} from '../../api/use-hazards';
import { formatDateTime } from '../../lib/format-date';
import { hazardsErrorMessage } from '../../lib/error-messages';
import {
  formatMeasurement,
  HAZARD_STATUS_LABELS,
  HAZARD_TYPE_LABELS,
} from '../../lib/hazard-labels';
import { useAuthStore } from '../../state/auth-store';
import { useThemeColors, type ThemeColors } from '../../theme/colors';

/**
 * Hazard detail (design doc §8): "What, when, confirmations; Confirm / Not there". Reached after
 * filing a report (report-hazard.tsx navigates here on success). Tapping an existing pin on the
 * map instead opens the same content as a drawer (`components/hazard-detail-drawer.tsx`), not
 * this screen — a full navigation away from the map didn't fit "map is the app."
 */
export default function HazardDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: hazard, isLoading, isError } = useHazard(id);
  const confirmMutation = useConfirmHazard();
  const dismissMutation = useDismissHazard();
  const deleteMutation = useDeleteHazard();
  const isAdmin = useAuthStore((s) => s.state.status === 'signedIn' && s.state.driver.isAdmin);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loading} size="large" color={colors.text} />
      </SafeAreaView>
    );
  }

  if (isError || hazard === undefined) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.message}>That report isn’t there any more.</Text>
      </SafeAreaView>
    );
  }

  const actionError = confirmMutation.isError
    ? hazardsErrorMessage(confirmMutation.error)
    : dismissMutation.isError
      ? hazardsErrorMessage(dismissMutation.error)
      : deleteMutation.isError
        ? hazardsErrorMessage(deleteMutation.error)
        : undefined;
  const actionPending = confirmMutation.isPending || dismissMutation.isPending;

  // Admin-only test-data cleanup (field-testing request, 2026-09-26) — hidden from anyone whose
  // account isn't flagged (`isAdmin`, checked here so a non-admin never sees a control that would
  // just 403), on top of the server enforcing the same thing regardless. Confirmed first since
  // it's a true, unrecoverable delete, not a status flip like dismiss.
  function handleDelete(): void {
    Alert.alert('Delete this report?', 'This removes it permanently. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!hazard) return;
          deleteMutation.mutate(hazard.id, { onSuccess: () => router.back() });
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{HAZARD_TYPE_LABELS[hazard.type]}</Text>
        <Text style={styles.status}>{HAZARD_STATUS_LABELS[hazard.status] ?? hazard.status}</Text>

        {hazard.measurement !== undefined && (
          <Text style={styles.detail}>{formatMeasurement(hazard.measurement)}</Text>
        )}
        {hazard.note !== undefined && <Text style={styles.detail}>{hazard.note}</Text>}

        <Text style={styles.meta}>Reported {formatDateTime(hazard.createdAt)}</Text>
        <Text style={styles.meta}>
          {hazard.confirmations} confirmation{hazard.confirmations === 1 ? '' : 's'} ·{' '}
          {hazard.dismissals} said not there
        </Text>

        {actionError !== undefined && <Text style={styles.error}>{actionError}</Text>}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.button, styles.confirmButton, actionPending && styles.buttonDisabled]}
            disabled={actionPending}
            onPress={() => confirmMutation.mutate(hazard.id)}
            testID="confirm-hazard-button"
          >
            {confirmMutation.isPending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>Still there</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.dismissButton, actionPending && styles.buttonDisabled]}
            disabled={actionPending}
            onPress={() => dismissMutation.mutate(hazard.id)}
            testID="dismiss-hazard-button"
          >
            {dismissMutation.isPending ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={[styles.buttonText, styles.dismissButtonText]}>Not there</Text>
            )}
          </TouchableOpacity>
        </View>

        {isAdmin && (
          <TouchableOpacity
            style={styles.deleteButton}
            disabled={deleteMutation.isPending}
            onPress={handleDelete}
            testID="delete-hazard-button"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator color={colors.danger} />
            ) : (
              <Text style={styles.deleteButtonText}>Delete report</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
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
      padding: 24,
      gap: 8,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    status: {
      fontSize: 16,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    detail: {
      fontSize: 18,
      color: colors.textSecondary,
      marginTop: 8,
    },
    meta: {
      fontSize: 14,
      color: colors.textDim,
      marginTop: 8,
    },
    loading: {
      marginTop: 48,
    },
    message: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 48,
      paddingHorizontal: 24,
    },
    error: {
      fontSize: 16,
      color: colors.danger,
      marginTop: 16,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 24,
    },
    button: {
      flex: 1,
      minHeight: 56,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
    },
    confirmButton: {
      backgroundColor: colors.accent,
    },
    dismissButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.textDim,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    dismissButtonText: {
      color: colors.text,
    },
    // Admin-only, so deliberately understated rather than sitting alongside "Still there"/
    // "Not there" as an equal third option — a plain text-link style, not a filled button.
    deleteButton: {
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 16,
    },
    deleteButtonText: {
      fontSize: 15,
      color: colors.danger,
      textDecorationLine: 'underline',
    },
  });
}
