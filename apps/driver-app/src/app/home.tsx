import { useRouter } from 'expo-router';
import { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useNearbyHazards } from '../api/use-hazards';
import { HazardDetailDrawer } from '../components/hazard-detail-drawer';
import { RouteMap } from '../components/route-map';
import { useCurrentLocation } from '../hooks/use-current-location';

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
  const location = useCurrentLocation();
  const nearbyHazards = useNearbyHazards(location.point ? [location.point] : [], NEARBY_RADIUS_M);
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);

  return (
    <SafeAreaView style={styles.container}>
      <RouteMap
        origin={location.point}
        destination={undefined}
        hazards={nearbyHazards.data?.map((h) => ({ id: h.id, type: h.type, location: h.location }))}
        onHazardPress={setSelectedHazardId}
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

        <TouchableOpacity
          style={styles.hazardButton}
          onPress={() => router.push('/report-hazard')}
          testID="report-hazard-button"
        >
          <Text style={styles.hazardButtonText}>Report hazard</Text>
        </TouchableOpacity>

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
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
  hazardButton: {
    alignSelf: 'flex-end',
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
  planButton: {
    minHeight: 64,
    borderRadius: 32,
    backgroundColor: '#F5A623',
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
    color: '#0B1220',
  },
});
