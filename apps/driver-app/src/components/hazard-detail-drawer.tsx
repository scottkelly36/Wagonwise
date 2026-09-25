import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { useConfirmHazard, useDismissHazard, useHazard } from '../api/use-hazards';
import { hazardsErrorMessage } from '../lib/error-messages';
import { formatDateTime } from '../lib/format-date';
import { formatMeasurement, HAZARD_STATUS_LABELS, HAZARD_TYPE_LABELS } from '../lib/hazard-labels';

interface Props {
  readonly hazardId: string | undefined;
  readonly onClose: () => void;
}

/**
 * Full hazard details as a bottom drawer, not a map callout (design decision, 2026-09-24,
 * following up on "the tool tips still aren't right") — MapLibre's `ViewAnnotation` renders its
 * children onto a static bitmap on Android, so anything richer than an always-static marker icon
 * inside it fights the platform rather than working with it. This renders as an ordinary RN
 * `Modal`, entirely outside the map's own view tree, and reuses the same detail content and
 * confirm/dismiss actions as the full hazard screen (`app/hazards/[id].tsx`) — a driver tapping a
 * pin on the map gets the same answer as one who just filed the report.
 */
export function HazardDetailDrawer({ hazardId, onClose }: Props) {
  const { data: hazard, isLoading, isError } = useHazard(hazardId);
  const confirmMutation = useConfirmHazard();
  const dismissMutation = useDismissHazard();

  const actionError = confirmMutation.isError
    ? hazardsErrorMessage(confirmMutation.error)
    : dismissMutation.isError
      ? hazardsErrorMessage(dismissMutation.error)
      : undefined;
  const actionPending = confirmMutation.isPending || dismissMutation.isPending;

  return (
    <Modal
      visible={hazardId !== undefined}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.sheet}>
        {isLoading ? (
          <ActivityIndicator style={styles.loading} size="large" color="#FFFFFF" />
        ) : isError || hazard === undefined ? (
          <Text style={styles.message}>That report isn’t there any more.</Text>
        ) : (
          <>
            <View style={styles.handle} />
            <Text style={styles.title}>{HAZARD_TYPE_LABELS[hazard.type]}</Text>
            <Text style={styles.status}>
              {HAZARD_STATUS_LABELS[hazard.status] ?? hazard.status}
            </Text>

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
                style={[
                  styles.button,
                  styles.confirmButton,
                  actionPending && styles.buttonDisabled,
                ]}
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
                style={[
                  styles.button,
                  styles.dismissButton,
                  actionPending && styles.buttonDisabled,
                ]}
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
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: '#0B1220',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    gap: 4,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#334155',
    marginBottom: 16,
  },
  loading: {
    marginVertical: 48,
  },
  message: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginVertical: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  status: {
    fontSize: 14,
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  detail: {
    fontSize: 17,
    color: '#E5E7EB',
    marginTop: 8,
  },
  meta: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  error: {
    fontSize: 15,
    color: '#F87171',
    marginTop: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
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
