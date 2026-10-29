import type { FuelStationDto } from '@wagonwise/contracts/fuel';
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

import {
  addressText,
  FUEL_ACCESS_NOTE,
  FUEL_CREDIT,
  priceText,
  stationTitle,
  updatedText,
} from '../lib/fuel-details';
import { shortDistance } from '../lib/uk-distance';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { FUEL_COLOUR } from './fuel-colour';
import { Icon } from './ui/icon';

interface Props {
  /** The tapped station, or undefined when the drawer is closed. */
  readonly station: FuelStationDto | undefined;
  readonly onClose: () => void;
  readonly onNavigate: (station: FuelStationDto) => void;
  readonly navigateDisabled?: boolean;
}

/**
 * A fuel station's diesel price as a bottom drawer, the same pattern as `ParkingSpotDrawer`. The station is already in the list the
 * map drew its marker from, so there is nothing to fetch. The price always carries when the station reported it.
 */
export function FuelStationDrawer({
  station,
  onClose,
  onNavigate,
  navigateDisabled = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const address = station === undefined ? undefined : addressText(station);

  return (
    <Modal
      visible={station !== undefined}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 24 }]}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <View style={styles.badge}>
              <Icon name="gas-station" size={30} color={FUEL_COLOUR} />
            </View>
            <View style={styles.titleText}>
              <Text style={styles.title} numberOfLines={2}>
                {station === undefined ? 'Fuel' : stationTitle(station)}
              </Text>
              <Text style={styles.status}>Diesel</Text>
            </View>
          </View>

          {station !== undefined && (
            <>
              <Text style={styles.price} testID="fuel-price">
                {priceText(station.pencePerLitre)}
                <Text style={styles.perLitre}> a litre</Text>
              </Text>
              <Text style={styles.updated} testID="fuel-updated">
                {updatedText(station.priceUpdatedAt, new Date())}
              </Text>
              {address !== undefined && <Text style={styles.detail}>{address}</Text>}
              <Text style={styles.detail}>
                {shortDistance(station.distanceM)} away
                {station.isMotorway ? ' · Motorway services' : ''}
                {station.isSupermarket ? ' · Supermarket' : ''}
              </Text>
              <Text style={styles.meta}>{FUEL_ACCESS_NOTE}</Text>
              <Text style={styles.meta}>{FUEL_CREDIT}</Text>

              <TouchableOpacity
                style={[styles.navigateButton, navigateDisabled && styles.disabled]}
                disabled={navigateDisabled}
                onPress={() => onNavigate(station)}
                accessibilityRole="button"
                testID="fuel-navigate-button"
              >
                <Icon name="navigation-variant" size={22} color={colors.textOnAccent} />
                <Text style={styles.navigateText}>Take me there</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            testID="fuel-drawer-close"
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
    // Fixed black in both themes, as on the hazard and parking drawers.
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
    price: { fontSize: 40, fontWeight: '800', color: colors.text, marginTop: 12 },
    perLitre: { fontSize: 18, fontWeight: '600', color: colors.textMuted },
    updated: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
    detail: { fontSize: 17, color: colors.textSecondary, marginTop: 8 },
    meta: { fontSize: 14, color: colors.textDim, marginTop: 8 },
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
