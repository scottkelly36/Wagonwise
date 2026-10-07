import { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNearbySafeParkingSpots } from '../api/use-parking';
import { Icon } from '../components/ui/icon';
import { ACTION_COLOURS } from '../components/ui/action-card';
import { ScreenHeader } from '../components/ui/screen-header';
import { useCurrentLocation } from '../hooks/use-current-location';
import { useNavigateToPlace } from '../hooks/use-navigate-to-spot';
import { useDrivingProfileId, useParkingDriveTimes } from '../hooks/use-parking-drive-times';
import { jobNavigationErrorMessage } from '../lib/error-messages';
import { nearestParkingSpots } from '../lib/nearest-parking';
import { shortDistance } from '../lib/uk-distance';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';

/** How far to look for parking: well beyond the map's own radius, since a lorry driver will go
 *  further than the length of the high street for somewhere safe. */
const SEARCH_RADIUS_M = 30_000;
const KM_TO_M = 1000;

/**
 * Nearby parking (P2): the closest driver-reported safe parking spots with the drive time to each, so
 * a driver picks where to go. Tapping one plans the route and opens the trip screen. The five
 * nearest as the crow flies are timed by road, then shown shortest drive first.
 */
export default function NearbyParkingScreen() {
  const location = useCurrentLocation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const spots = useNearbySafeParkingSpots(location.point ? [location.point] : [], SEARCH_RADIUS_M);
  const profileId = useDrivingProfileId();
  const navigate = useNavigateToPlace(profileId);

  const nearest = useMemo(
    () => (location.point && spots.data ? nearestParkingSpots(spots.data, location.point) : []),
    [location.point, spots.data],
  );
  const times = useParkingDriveTimes(
    location.point,
    nearest.map((n) => n.spot),
    profileId,
  );

  // Shortest drive first once known; a spot still being timed (or with no route) keeps its
  // crow-flies place after the timed ones.
  const rows = useMemo(
    () =>
      [...nearest].sort((a, b) => {
        const ta = times[a.spot.id]?.minutes;
        const tb = times[b.spot.id]?.minutes;
        if (ta !== undefined && tb !== undefined) return ta - tb;
        if (ta !== undefined) return -1;
        if (tb !== undefined) return 1;
        return a.distanceM - b.distanceM;
      }),
    [nearest, times],
  );

  const loading = location.status === 'loading' || spots.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <ScreenHeader title="Nearby parking" subtitle="Safe spots reported by drivers" />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {loading && <ActivityIndicator size="large" color={colors.text} />}

        {!loading && location.point === undefined && (
          <Text style={styles.message}>
            Turn on location so we can find parking near you, then try again.
          </Text>
        )}

        {!loading && location.point !== undefined && spots.isError && (
          <Text style={styles.message}>
            Couldn’t load parking. Check your signal and try again.
          </Text>
        )}

        {!loading && location.point !== undefined && !spots.isError && rows.length === 0 && (
          <Text style={styles.message} testID="nearby-parking-empty">
            No parking has been reported near you yet. Use Mark parking on the map to add one.
          </Text>
        )}

        {rows.map(({ spot, distanceM }) => {
          const time = times[spot.id];
          return (
            <TouchableOpacity
              key={spot.id}
              style={styles.row}
              disabled={navigate.isPending || profileId === undefined}
              onPress={() => navigate.mutate(spot.location)}
              accessibilityRole="button"
              testID={`parking-row-${spot.id}`}
            >
              <View style={styles.badge}>
                <Icon name="parking" size={28} color={ACTION_COLOURS.parking} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.time}>
                  {time ? `${Math.max(1, Math.round(time.minutes))} min` : '…'}
                  <Text style={styles.distance}>
                    {'  ·  '}
                    {shortDistance(time ? time.km * KM_TO_M : distanceM)}
                    {time ? '' : ' away'}
                  </Text>
                </Text>
                <Text style={styles.note} numberOfLines={2}>
                  {spot.note ?? 'Safe parking'}
                </Text>
              </View>
              <Icon name="chevron-right" size={26} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })}

        {profileId === undefined && rows.length > 0 && (
          <Text style={styles.message}>
            Add a vehicle profile (More, then Vehicle profiles) to get drive times and directions.
          </Text>
        )}
        {navigate.isError && (
          <Text style={styles.error}>{jobNavigationErrorMessage(navigate.error)}</Text>
        )}
        {navigate.isPending && <ActivityIndicator color={colors.text} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingTop: 8 },
    content: { padding: 16, gap: 12 },
    row: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      minHeight: 72,
    },
    badge: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowText: { flex: 1 },
    time: { fontSize: 22, fontWeight: '800', color: colors.text },
    distance: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
    note: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
    message: { fontSize: 16, color: colors.textMuted, textAlign: 'center', marginTop: 16 },
    error: { fontSize: 16, color: colors.danger, textAlign: 'center' },
  });
}
