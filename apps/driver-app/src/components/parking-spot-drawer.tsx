import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';
import { useMemo } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime } from '../lib/format-date';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { ACTION_COLOURS } from './ui/action-card';
import { Icon } from './ui/icon';

interface Props {
  /** The tapped spot, or undefined when the drawer is closed. */
  readonly spot: SafeParkingSpotDto | undefined;
  readonly onClose: () => void;
}

/**
 * A safe parking spot's details as a bottom drawer, the same pattern as `HazardDetailDrawer` (an
 * ordinary `Modal` outside the map's view tree). The spot is already in the list the map drew its
 * marker from, so there is nothing to fetch: it shows the driver's note and when it was reported.
 */
export function ParkingSpotDrawer({ spot, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={spot !== undefined} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.badge}>
              <Icon name="parking" size={30} color={ACTION_COLOURS.parking} />
            </View>
            <View style={styles.titleText}>
              <Text style={styles.title}>Safe parking</Text>
              <Text style={styles.status}>Reported by a driver</Text>
            </View>
          </View>

          {spot?.note !== undefined && <Text style={styles.detail}>{spot.note}</Text>}
          {spot !== undefined && (
            <Text style={styles.meta}>Reported {formatDateTime(spot.reportedAt)}</Text>
          )}

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            testID="parking-drawer-close"
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    // Fixed black in both themes, as on the hazard drawer.
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
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceStrong,
      marginBottom: 16,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    badge: {
      width: 52,
      height: 52,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    titleText: { flex: 1 },
    title: { fontSize: 24, fontWeight: '700', color: colors.text },
    status: { fontSize: 14, color: colors.textMuted, textTransform: 'uppercase' },
    detail: { fontSize: 17, color: colors.textSecondary, marginTop: 8 },
    meta: { fontSize: 14, color: colors.textDim, marginTop: 8 },
    closeButton: {
      marginTop: 20,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.textDim,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeText: { fontSize: 18, fontWeight: '700', color: colors.text },
  });
}
