import { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConfirmHazard, useDismissHazard, useHazard } from '../api/use-hazards';
import { hazardsErrorMessage } from '../lib/error-messages';
import { formatDateTime } from '../lib/format-date';
import { formatMeasurement, HAZARD_STATUS_LABELS, HAZARD_TYPE_LABELS } from '../lib/hazard-labels';
import { HAZARD_TYPE_ICONS } from '../lib/hazard-icons';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { Icon } from './ui/icon';

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
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal
      visible={hazardId !== undefined}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* `backdrop` and `sheet` used to be plain flex siblings — backdrop's rectangle stopped
          exactly where sheet's began, so sheet's own rounded top corners had nothing behind
          them but the Modal's native (light) window background, showing as a pale sliver in
          each corner (found from a screenshot, 2026-09-26). `backdrop` now absolutely covers
          this whole container instead, so it's still there — dimmed, not pale — behind the
          corners sheet's border-radius cuts away. */}
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
          {isLoading ? (
            <ActivityIndicator style={styles.loading} size="large" color={colors.text} />
          ) : isError || hazard === undefined ? (
            <Text style={styles.message}>That report isn’t there any more.</Text>
          ) : (
            <>
              <View style={styles.handle} />
              <View style={styles.titleRow}>
                <View style={styles.badge}>
                  <Icon name={HAZARD_TYPE_ICONS[hazard.type]} size={30} color={colors.warning} />
                </View>
                <View style={styles.titleText}>
                  <Text style={styles.title}>{HAZARD_TYPE_LABELS[hazard.type]}</Text>
                  <Text style={styles.status}>
                    {HAZARD_STATUS_LABELS[hazard.status] ?? hazard.status}
                  </Text>
                </View>
              </View>

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
                    <ActivityIndicator color={colors.textOnAccent} />
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
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={[styles.buttonText, styles.dismissButtonText]}>Not there</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    // Fills the whole Modal; `justifyContent: 'flex-end'` is what actually puts `sheet` at the
    // bottom — `backdrop` below is absolutely positioned across all of this, not just the space
    // above `sheet`, so it still shows (dimmed) behind `sheet`'s own rounded top corners.
    container: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    // A modal dimming backdrop — kept a fixed black regardless of theme, the same everywhere
    // this pattern shows up (standard UX, not part of the light/dark app chrome).
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: 20,
      paddingTop: 12,
      gap: 4,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
    },
    badge: {
      width: 52,
      height: 52,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    titleText: {
      flex: 1,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceStrong,
      marginBottom: 16,
    },
    loading: {
      marginVertical: 48,
    },
    message: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      marginVertical: 48,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    status: {
      fontSize: 14,
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    detail: {
      fontSize: 17,
      color: colors.textSecondary,
      marginTop: 8,
    },
    meta: {
      fontSize: 14,
      color: colors.textDim,
      marginTop: 8,
    },
    error: {
      fontSize: 15,
      color: colors.danger,
      marginTop: 12,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    button: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
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
