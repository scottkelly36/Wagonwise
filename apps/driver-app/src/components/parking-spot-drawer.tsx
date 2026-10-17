import type { SafeParkingSpotDto } from '@wagonwise/contracts/parking';
import { useMemo, useState } from 'react';
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
import {
  capacityText,
  costText,
  facilityStates,
  notesToShow,
  OSM_CREDIT,
  reportersText,
  sourceText,
} from '../lib/parking-details';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { ParkingSuggestForm } from './parking-suggest-form';
import { ACTION_COLOURS } from './ui/action-card';
import { Icon } from './ui/icon';

interface Props {
  /** The tapped spot, or undefined when the drawer is closed. */
  readonly spot: SafeParkingSpotDto | undefined;
  readonly onClose: () => void;
  /** Take the driver there. Absent (or `busy`/`disabled`) hides or greys the button. */
  readonly onNavigate?: (spot: SafeParkingSpotDto) => void;
  readonly navigateDisabled?: boolean;
}

/**
 * A safe parking spot's details as a bottom drawer, the same pattern as `HazardDetailDrawer` (an
 * ordinary `Modal` outside the map's view tree). The spot is already in the list the map drew its
 * marker from, so there is nothing to fetch: it shows the driver's note and when it was reported.
 */
export function ParkingSpotDrawer({ spot, onClose, onNavigate, navigateDisabled = false }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Which spot the suggestion form is open for; closing the drawer always goes back to the details.
  const [suggestingFor, setSuggestingFor] = useState<string | undefined>(undefined);
  const suggesting = spot !== undefined && suggestingFor === spot.id;
  const close = (): void => {
    setSuggestingFor(undefined);
    onClose();
  };

  return (
    <Modal visible={spot !== undefined} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={close}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
          <View style={styles.handle} />
          {spot !== undefined && suggesting ? (
            <ParkingSuggestForm spot={spot} onDone={() => setSuggestingFor(undefined)} />
          ) : (
            <>
              <View style={styles.titleRow}>
                <View style={styles.badge}>
                  <Icon name="parking" size={30} color={ACTION_COLOURS.parking} />
                </View>
                <View style={styles.titleText}>
                  <Text style={styles.title}>{spot?.name ?? 'Safe parking'}</Text>
                  <Text style={styles.status}>{spot === undefined ? '' : sourceText(spot)}</Text>
                </View>
              </View>

              {spot !== undefined &&
                notesToShow(spot).map((note) => (
                  <Text key={note} style={styles.detail}>
                    {note}
                  </Text>
                ))}
              {spot !== undefined && capacityText(spot) !== undefined && (
                <Text style={styles.detail}>{capacityText(spot)}</Text>
              )}
              {spot !== undefined && costText(spot) !== undefined && (
                <Text style={styles.detail}>{costText(spot)}</Text>
              )}
              {spot !== undefined && (
                <>
                  <View style={styles.chips} testID="parking-facilities">
                    {facilityStates(spot).map((f) => (
                      <View
                        key={f.key}
                        style={styles.facility}
                        accessible
                        accessibilityLabel={`${f.label}: ${f.there ? 'yes' : 'not there, or not known'}`}
                      >
                        <Icon
                          name={f.icon}
                          size={28}
                          color={f.there ? colors.accentGreen : colors.surfaceStrong}
                        />
                        <Text style={[styles.facilityText, !f.there && styles.facilityOff]}>
                          {f.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.meta}>
                    Green is there. Grey is not there, or not known yet.
                  </Text>
                </>
              )}
              {spot !== undefined && (
                <Text style={styles.meta}>
                  {[
                    spot.source === 'osm' ? OSM_CREDIT : sourceText(spot),
                    reportersText(spot),
                    (spot.reporterCount ?? 0) > 0
                      ? `last ${formatDateTime(spot.lastReportedAt ?? spot.reportedAt)}`
                      : undefined,
                  ]
                    .filter((part) => part !== undefined)
                    .join(' · ')}
                </Text>
              )}

              {spot !== undefined && onNavigate && (
                <TouchableOpacity
                  style={[styles.navigateButton, navigateDisabled && styles.disabled]}
                  disabled={navigateDisabled}
                  onPress={() => onNavigate(spot)}
                  testID="parking-navigate-button"
                >
                  <Icon name="navigation-variant" size={22} color={colors.textOnAccent} />
                  <Text style={styles.navigateText}>Take me there</Text>
                </TouchableOpacity>
              )}

              {spot !== undefined && (
                <TouchableOpacity
                  style={styles.suggestLink}
                  onPress={() => setSuggestingFor(spot.id)}
                  testID="parking-suggest-link"
                  accessibilityRole="button"
                >
                  <Text style={styles.suggestText}>
                    Wrong or missing something? Suggest a change
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.closeButton}
                onPress={close}
                testID="parking-drawer-close"
              >
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </>
          )}
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
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 12 },
    facility: { width: '25%', minWidth: 72, alignItems: 'center', gap: 2, paddingVertical: 6 },
    facilityText: { fontSize: 13, fontWeight: '700', color: colors.text },
    facilityOff: { color: colors.textDim, fontWeight: '600' },
    navigateButton: {
      marginTop: 20,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.accent,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    navigateText: { fontSize: 18, fontWeight: '700', color: colors.textOnAccent },
    disabled: { opacity: 0.5 },
    suggestLink: { marginTop: 14, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    suggestText: { fontSize: 15, fontWeight: '600', color: colors.accent },
    closeButton: {
      marginTop: 12,
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
