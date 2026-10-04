import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useConfirmHazard, useDismissHazard, useHazard } from '../../api/use-hazards';
import { formatDateTime } from '../../lib/format-date';
import { hazardsErrorMessage } from '../../lib/error-messages';
import {
  formatMeasurement,
  HAZARD_STATUS_LABELS,
  HAZARD_TYPE_LABELS,
} from '../../lib/hazard-labels';
import { Icon } from '../../components/ui/icon';
import { ScreenHeader } from '../../components/ui/screen-header';
import { HAZARD_TYPE_ICONS } from '../../lib/hazard-icons';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle } from '../../theme/tokens';

/**
 * Hazard detail (design doc §8): "What, when, confirmations; Confirm / Not there". Reached after
 * filing a report (report-hazard.tsx navigates here on success). Tapping an existing pin on the
 * map instead opens the same content as a drawer (`components/hazard-detail-drawer.tsx`), not
 * this screen — a full navigation away from the map didn't fit "map is the app."
 */
export default function HazardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: hazard, isLoading, isError } = useHazard(id);
  const confirmMutation = useConfirmHazard();
  const dismissMutation = useDismissHazard();
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
      : undefined;
  const actionPending = confirmMutation.isPending || dismissMutation.isPending;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ScreenHeader
          title={HAZARD_TYPE_LABELS[hazard.type]}
          subtitle={HAZARD_STATUS_LABELS[hazard.status] ?? hazard.status}
        />

        <View style={styles.card}>
          <Icon name={HAZARD_TYPE_ICONS[hazard.type]} size={40} color={colors.warning} />
          {hazard.measurement !== undefined && (
            <Text style={styles.detail}>{formatMeasurement(hazard.measurement)}</Text>
          )}
          {hazard.note !== undefined && <Text style={styles.detail}>{hazard.note}</Text>}
          <Text style={styles.meta}>Reported {formatDateTime(hazard.createdAt)}</Text>
          <Text style={styles.meta}>
            {hazard.confirmations} confirmation{hazard.confirmations === 1 ? '' : 's'} ·{' '}
            {hazard.dismissals} said not there
          </Text>
        </View>

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
      padding: 16,
      gap: 12,
    },
    card: {
      ...cardStyle(colors),
      padding: 18,
      gap: 6,
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
      minHeight: 60,
      borderRadius: 30,
      justifyContent: 'center',
      alignItems: 'center',
    },
    confirmButton: {
      backgroundColor: colors.accent,
    },
    dismissButton: {
      backgroundColor: colors.surface,
      borderWidth: 2,
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
  });
}
