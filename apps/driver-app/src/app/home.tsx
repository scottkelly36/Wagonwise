import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useNearbyCongestion } from '../api/use-congestion';
import { useNearbyHazards } from '../api/use-hazards';
import { useNearbySafeParkingSpots } from '../api/use-parking';
import { HazardDetailDrawer } from '../components/hazard-detail-drawer';
import { RouteMap } from '../components/route-map';
import { useLiveLocation } from '../hooks/use-live-location';
import { useThemeColors, type ThemeColors } from '../theme/colors';

// "Within x amount of distance from you" (design decision, 2026-09-24) — a driver stood still or
// walking to the cab doesn't need a country-wide hazard feed, just what's actually around them.
const NEARBY_RADIUS_M = 5_000;

/**
 * The map is the app (design decision, 2026-09-24): a driver signs in and lands straight on a
 * full-screen map, the way a navigation app works, rather than a menu of buttons. Everything a
 * driver doesn't need constantly on screen — vehicle profiles, saved reports, feedback, signing
 * out — moves behind the small corner icon into `/settings`; the two things they *do* need
 * constantly (plan a route, report a hazard) are overlaid directly on the map itself.
 */
export default function HomeScreen() {
  const router = useRouter();
  // A continuous watch, not `useCurrentLocation`'s one-shot fix — this screen's dot is meant to
  // track where the driver actually is right now (design decision, "map is the app"), not a
  // snapshot cached from whenever this screen first happened to mount. A one-shot fix here read
  // as the dot "sticking" at wherever a trip started, since `useCurrentLocation`'s query never
  // refetches on its own (bug found 2026-09-26: dot stayed at the trip's start point after
  // ending the trip and moving away from it).
  const location = useLiveLocation();
  const nearbyHazards = useNearbyHazards(location.point ? [location.point] : [], NEARBY_RADIUS_M);
  const nearbyCongestion = useNearbyCongestion(
    location.point ? [location.point] : [],
    NEARBY_RADIUS_M,
  );
  const nearbyParkingSpots = useNearbySafeParkingSpots(
    location.point ? [location.point] : [],
    NEARBY_RADIUS_M,
  );
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <RouteMap
        origin={location.point}
        destination={undefined}
        hazards={nearbyHazards.data?.map((h) => ({ id: h.id, type: h.type, location: h.location }))}
        onHazardPress={setSelectedHazardId}
        congestion={nearbyCongestion.data?.map((c) => ({
          id: c.id,
          location: c.location,
          estimatedWaitMinutes: c.estimatedWaitMinutes,
        }))}
        parkingSpots={nearbyParkingSpots.data?.map((s) => ({ id: s.id, location: s.location }))}
      />

      <HazardDetailDrawer
        hazardId={selectedHazardId}
        onClose={() => setSelectedHazardId(undefined)}
      />

      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => router.push('/settings')}
        testID="menu-button"
      >
        <Text style={styles.menuButtonText}>Menu</Text>
      </TouchableOpacity>

      <View style={styles.overlay} pointerEvents="box-none">
        {location.status === 'denied' && (
          <Text style={styles.hint}>
            Location access is off — you can still plan a route, but the map won’t centre on you.
          </Text>
        )}

        <View style={styles.reportButtonRow}>
          <TouchableOpacity
            style={styles.hazardButton}
            onPress={() => router.push('/report-congestion')}
            testID="report-congestion-button"
          >
            <Text style={styles.hazardButtonText}>Report traffic</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hazardButton}
            onPress={() => router.push('/report-hazard')}
            testID="report-hazard-button"
          >
            <Text style={styles.hazardButtonText}>Report hazard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.hazardButton}
            onPress={() => router.push('/report-safe-parking-spot')}
            testID="report-parking-spot-button"
          >
            <Text style={styles.hazardButtonText}>Mark parking</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.planButton}
          onPress={() => router.push('/plan-route')}
          testID="plan-route-button"
        >
          <Text style={styles.planButtonText}>Where to?</Text>
        </TouchableOpacity>
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
    // Everything below floats on top of the (unthemed) map itself, not the app chrome — kept as
    // fixed dark/translucent values in both themes, same reasoning as active-trip.tsx's mic
    // overlay, so these stay legible against the map's own imagery regardless of theme.
    menuButton: {
      position: 'absolute',
      top: 56,
      right: 16,
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: 16,
      borderRadius: 24,
      backgroundColor: 'rgba(11, 18, 32, 0.85)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    overlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      padding: 16,
      paddingBottom: 32,
      gap: 12,
    },
    hint: {
      fontSize: 13,
      color: '#E5E7EB',
      textAlign: 'center',
      backgroundColor: 'rgba(11, 18, 32, 0.85)',
      borderRadius: 12,
      padding: 12,
    },
    reportButtonRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
      gap: 12,
    },
    hazardButton: {
      minHeight: 48,
      paddingHorizontal: 20,
      borderRadius: 24,
      backgroundColor: 'rgba(31, 41, 55, 0.92)',
      borderWidth: 1,
      borderColor: '#6B7280',
      justifyContent: 'center',
      alignItems: 'center',
    },
    hazardButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    // Unlike the overlay buttons above, this one isn't about map legibility — it's the app's
    // main CTA, so it follows the theme's own accent colour (constant across light/dark anyway)
    // rather than a hardcoded copy of it that would silently drift if the accent ever changes
    // (it just did, 2026-09-26: orange -> blue).
    planButton: {
      minHeight: 64,
      borderRadius: 32,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000000',
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    planButtonText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
  });
}
