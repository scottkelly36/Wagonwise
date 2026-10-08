import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNearbyCongestion } from '../../api/use-congestion';
import { useNearbyHazards } from '../../api/use-hazards';
import { useCurrentJob } from '../../api/use-jobs';
import { useNearbySafeParkingSpots } from '../../api/use-parking';
import { HazardDetailDrawer } from '../../components/hazard-detail-drawer';
import { useNavigateToPlace } from '../../hooks/use-navigate-to-spot';
import { useDrivingProfileId } from '../../hooks/use-parking-drive-times';
import { ParkingSpotDrawer } from '../../components/parking-spot-drawer';
import { MarkPlaceSheet } from '../../components/mark-place-sheet';
import { PlaceSheet } from '../../components/place-sheet';
import { useMyPlaces } from '../../api/use-places';
import type { SavedPlaceDto } from '@wagonwise/contracts/places';
import { JobCard } from '../../components/job-card';
import { RouteMap, type RouteMapHandle } from '../../components/route-map';
import { ACTION_COLOURS, ActionCard } from '../../components/ui/action-card';
import { Icon } from '../../components/ui/icon';
import { RoundButton } from '../../components/ui/round-button';
import { useJobArrivalGeofence } from '../../hooks/use-job-arrival-geofence';
import { PositionSharingChip } from '../../components/position-sharing-chip';
import { isSharingPosition } from '../../lib/job-position-reporting';
import { useCurrentActiveTripStore } from '../../state/current-active-trip-store';
import { useJobPositionReporting } from '../../hooks/use-job-position-reporting';
import { useLiveLocation } from '../../hooks/use-live-location';
import { jobSubtitle, navigationTarget } from '../../lib/job-navigation';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle, radius } from '../../theme/tokens';

// "Within x amount of distance from you" (design decision, 2026-09-24) — a driver stood still or
// walking to the cab doesn't need a country-wide hazard feed, just what's actually around them.
const NEARBY_RADIUS_M = 5_000;
// Parking is looked for further out than hazards and traffic: a driver wants to see where the nearest
// safe place to stop is, and it is rarely within a few streets.
const NEARBY_PARKING_RADIUS_M = 20_000;

// Town-level, so a driver sees the streets and the next junction, not a street-by-street close-up.
const HOME_MAP_ZOOM = 14;

// Hazard, traffic and parking icons keep their own colour in both themes: they stand for what is
// on the map, so a driver learns one red-orange triangle, one orange cone, one blue P.

/**
 * The map is the app (design decision, 2026-09-24): a driver signs in and lands straight on a
 * full-screen map, the way a navigation app works. What floats over it follows the redesign mock
 * (2026-10-04): the current job as a card and a Menu shortcut along the top, round recentre and
 * layers buttons down the right, the three quick reports above a "Where to?" sheet. The tab bar
 * below holds everything else.
 */
export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<RouteMapHandle>(null);
  // A continuous watch, not `useCurrentLocation`'s one-shot fix — this screen's dot is meant to
  // track where the driver actually is right now (design decision, "map is the app"), not a
  // snapshot cached from whenever this screen first happened to mount.
  const location = useLiveLocation();
  const nearbyHazards = useNearbyHazards(location.point ? [location.point] : [], NEARBY_RADIUS_M);
  const nearbyCongestion = useNearbyCongestion(
    location.point ? [location.point] : [],
    NEARBY_RADIUS_M,
  );
  const nearbyParkingSpots = useNearbySafeParkingSpots(
    location.point ? [location.point] : [],
    NEARBY_PARKING_RADIUS_M,
  );
  const drivingProfileId = useDrivingProfileId();
  const navigateToSpot = useNavigateToPlace(drivingProfileId);
  const myPlaces = useMyPlaces();
  const mapPlaces = useMemo(
    () => myPlaces.places.map((p) => ({ id: p.id, category: p.category, location: p.location })),
    [myPlaces.places],
  );
  const [selectedPlace, setSelectedPlace] = useState<SavedPlaceDto | undefined>(undefined);
  const [markingPlace, setMarkingPlace] = useState(false);
  const [selectedParkingId, setSelectedParkingId] = useState<string | undefined>(undefined);
  const selectedParking = nearbyParkingSpots.data?.find((s) => s.id === selectedParkingId);
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);
  const [following, setFollowing] = useState(true);
  // Which kinds of marker the map shows. All on until a driver turns something off to declutter.
  const [layersOpen, setLayersOpen] = useState(false);
  const [showHazards, setShowHazards] = useState(true);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showParking, setShowParking] = useState(true);
  // "Company vs personal" (design doc §5): outside an assigned job this is just absent, and the
  // map works exactly as Phase 1 — no job-shaped chrome for a driver who isn't on one.
  const currentJob = useCurrentJob();
  // M5.4: "Arrived at pickup?" / "Arrived?" once the driver's close enough to the job's next
  // stop — a confirm, never an automatic status change.
  useJobArrivalGeofence(currentJob.data, location.point);
  // P2-M6.1: the company's live map. Same position, same screen, only while the job is on the road.
  const navigating = useCurrentActiveTripStore((s) => s.trip !== undefined);
  useJobPositionReporting(currentJob.data, location.point, navigating);
  const sharing = currentJob.data ? isSharingPosition(currentJob.data.status, navigating) : false;
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const top = insets.top + 8;

  return (
    <View style={styles.container}>
      <RouteMap
        ref={mapRef}
        origin={undefined}
        destination={undefined}
        currentPosition={location.point}
        followZoom={HOME_MAP_ZOOM}
        onFollowingChange={setFollowing}
        hideRecenterButton
        hazards={
          showHazards
            ? nearbyHazards.data?.map((h) => ({ id: h.id, type: h.type, location: h.location }))
            : undefined
        }
        onHazardPress={setSelectedHazardId}
        onParkingSpotPress={setSelectedParkingId}
        places={mapPlaces}
        onPlacePress={(id) => setSelectedPlace(myPlaces.places.find((p) => p.id === id))}
        congestion={
          showTraffic
            ? nearbyCongestion.data?.map((c) => ({
                id: c.id,
                location: c.location,
                estimatedWaitMinutes: c.estimatedWaitMinutes,
              }))
            : undefined
        }
        parkingSpots={
          showParking
            ? nearbyParkingSpots.data?.map((s) => ({ id: s.id, location: s.location }))
            : undefined
        }
      />

      <MarkPlaceSheet
        visible={markingPlace}
        onClose={() => setMarkingPlace(false)}
        stopName={currentJob.data ? navigationTarget(currentJob.data)?.stop.name : undefined}
        companyId={myPlaces.markingCompanyId}
      />

      <PlaceSheet
        place={selectedPlace}
        onClose={() => setSelectedPlace(undefined)}
        onGo={(place) => navigateToSpot.mutate(place.location)}
        goDisabled={navigateToSpot.isPending || drivingProfileId === undefined}
        shareCompanyId={myPlaces.markingCompanyId}
      />

      <ParkingSpotDrawer
        spot={selectedParking}
        onClose={() => setSelectedParkingId(undefined)}
        onNavigate={(spot) => navigateToSpot.mutate(spot.location)}
        navigateDisabled={navigateToSpot.isPending || drivingProfileId === undefined}
      />

      <HazardDetailDrawer
        hazardId={selectedHazardId}
        onClose={() => setSelectedHazardId(undefined)}
      />

      <View style={[styles.topRow, { top }]} pointerEvents="box-none">
        <View style={styles.topLeft} pointerEvents="box-none">
          {currentJob.data && (
            <JobCard
              title={`On job ${currentJob.data.reference}`}
              subtitle={jobSubtitle(currentJob.data)}
              onPress={() => router.push('/job')}
              testID="current-job-banner"
            />
          )}
          {sharing && (
            <View style={styles.sharingChip}>
              <PositionSharingChip />
            </View>
          )}
        </View>
      </View>

      <View
        style={[styles.rightColumn, { top: top + (currentJob.data ? 92 : 0) }]}
        pointerEvents="box-none"
      >
        <RoundButton
          icon="navigation-variant"
          label="Centre the map on me"
          active={following}
          onPress={() => mapRef.current?.recenter()}
          testID="recenter-button"
        />
        <RoundButton
          icon="parking"
          label="Nearby parking"
          onPress={() => router.push('/nearby-parking')}
          testID="nearby-parking-button"
        />
        <RoundButton
          icon="map-marker-plus-outline"
          label="Mark a place here"
          onPress={() => setMarkingPlace(true)}
          testID="mark-place-button"
        />
        <RoundButton
          icon="layers-outline"
          label="Map layers"
          active={layersOpen}
          onPress={() => setLayersOpen((open) => !open)}
          testID="layers-button"
        />
        {layersOpen && (
          <View style={styles.layersPanel} testID="layers-panel">
            <LayerRow
              label="Hazards"
              value={showHazards}
              onChange={setShowHazards}
              colors={colors}
            />
            <LayerRow
              label="Traffic"
              value={showTraffic}
              onChange={setShowTraffic}
              colors={colors}
            />
            <LayerRow
              label="Parking"
              value={showParking}
              onChange={setShowParking}
              colors={colors}
            />
          </View>
        )}
      </View>

      <View style={styles.overlay} pointerEvents="box-none">
        {location.status === 'denied' && (
          <Text style={styles.hint}>
            Location access is off — you can still plan a route, but the map won’t centre on you.
          </Text>
        )}

        <View style={styles.reportButtonRow}>
          <ActionCard
            icon="alert"
            iconColor={ACTION_COLOURS.traffic}
            label="Report traffic"
            onPress={() => router.push('/report-congestion')}
            testID="report-congestion-button"
          />
          <ActionCard
            icon="traffic-cone"
            iconColor={ACTION_COLOURS.hazard}
            label="Report hazard"
            onPress={() => router.push('/report-hazard')}
            testID="report-hazard-button"
          />
          <ActionCard
            icon="parking"
            iconColor={ACTION_COLOURS.parking}
            label="Mark parking"
            onPress={() => router.push('/report-safe-parking-spot')}
            testID="report-parking-spot-button"
          />
        </View>

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <TouchableOpacity
            style={styles.planButton}
            onPress={() => router.push('/plan-route')}
            accessibilityRole="button"
            testID="plan-route-button"
          >
            <Icon name="navigation-variant" size={24} color={colors.textOnAccent} />
            <Text style={styles.planButtonText}>Where to?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function LayerRow({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  colors: ThemeColors;
}) {
  return (
    <View style={layerRowStyle.row}>
      <Text style={[layerRowStyle.label, { color: colors.text }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.accent, false: colors.surfaceStrong }}
        accessibilityLabel={`Show ${label.toLowerCase()} on the map`}
      />
    </View>
  );
}

const layerRowStyle = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  label: { fontSize: 16, fontWeight: '600' },
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // Everything below floats over the map: lifted cards (white in light, slate in dark) so they stay
    // legible against the map's own imagery in either theme.
    topRow: {
      position: 'absolute',
      left: 16,
      right: 16,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    topLeft: { flex: 1 },
    sharingChip: { marginTop: 8 },
    rightColumn: {
      position: 'absolute',
      right: 16,
      gap: 12,
      alignItems: 'flex-end',
    },
    layersPanel: {
      ...cardStyle(colors),
      padding: 14,
      gap: 12,
      minWidth: 190,
    },
    overlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 12,
    },
    hint: {
      fontSize: 14,
      color: '#FFFFFF',
      backgroundColor: 'rgba(11, 18, 32, 0.85)',
      padding: 10,
      borderRadius: 12,
      overflow: 'hidden',
    },
    reportButtonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    sheet: {
      ...cardStyle(colors),
      // Edge to edge, like the mock: only the top corners are rounded.
      marginHorizontal: -16,
      marginBottom: -12,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 16,
      gap: 12,
      alignItems: 'stretch',
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.surfaceStrong,
    },
    planButton: {
      minHeight: 56,
      borderRadius: radius.card,
      backgroundColor: colors.accent,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    planButtonText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
  });
}
