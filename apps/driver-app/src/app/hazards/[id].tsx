import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useConfirmHazard, useDismissHazard, useHazard } from '../../api/use-hazards';
import { formatDateTime } from '../../lib/format-date';
import { hazardsErrorMessage } from '../../lib/error-messages';
import {
  formatMeasurement,
  HAZARD_STATUS_LABELS,
  HAZARD_TYPE_LABELS,
} from '../../lib/hazard-labels';

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

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loading} size="large" color="#FFFFFF" />
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
              <ActivityIndicator color="#0B1220" />
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
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.buttonText, styles.dismissButtonText]}>Not there</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  content: {
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  status: {
    fontSize: 16,
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  detail: {
    fontSize: 18,
    color: '#E5E7EB',
    marginTop: 8,
  },
  meta: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  loading: {
    marginTop: 48,
  },
  message: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 48,
    paddingHorizontal: 24,
  },
  error: {
    fontSize: 16,
    color: '#F87171',
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
    backgroundColor: '#F5A623',
  },
  dismissButton: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#6B7280',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0B1220',
  },
  dismissButtonText: {
    color: '#FFFFFF',
  },
});
