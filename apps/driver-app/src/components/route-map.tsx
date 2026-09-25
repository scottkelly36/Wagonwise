import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  ViewAnnotation,
  type LngLat,
  type LngLatBounds,
  type PressEvent,
} from '@maplibre/maplibre-react-native';
import type { HazardTypeDto } from '@wagonwise/contracts/hazards';
import type { NativeSyntheticEvent } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { config } from '../config';
import { hazardSeverityFor } from '../lib/hazard-labels';

export interface MapPoint {
  readonly lat: number;
  readonly lon: number;
}

export interface HazardMarker {
  readonly id: string;
  readonly type: HazardTypeDto;
  readonly location: MapPoint;
}

const HAZARD_MARKER_COLOR: Record<'high' | 'caution', string> = {
  high: '#F87171',
  caution: '#F59E0B',
};

interface Props {
  readonly origin: MapPoint | undefined;
  readonly destination: MapPoint | undefined;
  /** Present only on the route-overview screen (M5.5) — the plan-route screen (M5.4) has no
   *  route yet, since planning one is the whole point of that screen. */
  readonly routeLine?: [lon: number, lat: number][];
  /** The reroute-prompt screen's (M6.6) "old vs new" comparison (design doc §6: "Opening the
   *  notification shows old vs new route") — drawn in a second colour alongside `routeLine`,
   *  which stands for the *current* route in that comparison. Absent everywhere else. */
  readonly alternateRouteLine?: [lon: number, lat: number][];
  /** Absent on the route-overview screen — a planned route's origin/destination are fixed
   *  outcomes of `POST /routing/route-plans`, not editable by tapping the map afterwards. */
  readonly onMapPress?: (point: MapPoint) => void;
  /** The active-trip screen's live GPS fix (M5.6) — when present, the camera follows it instead
   *  of the static origin/destination the route was planned with, and it's drawn as its own
   *  marker rather than reusing the origin pin (a driver's live position drifts off the planned
   *  origin as soon as the trip starts). */
  readonly currentPosition?: MapPoint;
  /** Reported hazards to show as warning icons (design decision, 2026-09-24: "within x amount of
   *  distance from you or on your route", not every hazard in the country) — the caller decides
   *  the query (near the driver, near a route corridor) via `useNearbyHazards`; this component
   *  just draws whatever it's given. */
  readonly hazards?: readonly HazardMarker[];
  /** Fired when a hazard marker is tapped — the caller owns what happens next (design decision,
   *  2026-09-24: a full-details drawer, `components/hazard-detail-drawer.tsx`, rendered as its own
   *  `Modal` outside this component entirely). Deliberately not handled inside `RouteMap` itself:
   *  on Android, `ViewAnnotation` draws its children onto a static bitmap, so anything richer than
   *  an always-static marker icon inside it fights the platform rather than working with it —
   *  tried an in-map callout first (2026-09-24) and it never rendered reliably. */
  readonly onHazardPress?: (hazardId: string) => void;
}

function toLngLat(point: MapPoint): LngLat {
  return [point.lon, point.lat];
}

// A camera stop that fits a bounding box needs at least two points on two different corners —
// one point (or several identical ones, e.g. a route that's a single tap) has zero area and
// nothing to fit around, so those cases fall back to a plain center+zoom instead.
function boundsFor(points: readonly MapPoint[]): LngLatBounds | undefined {
  if (points.length < 2) return undefined;
  const lons = points.map((p) => p.lon);
  const lats = points.map((p) => p.lat);
  const west = Math.min(...lons);
  const east = Math.max(...lons);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  if (west === east && south === north) return undefined;
  return [west, south, east, north];
}

// Breathing room around the fitted box so a pin or the route line itself never sits flush
// against the map's edge — the panel below the map is a separate flex sibling (plan-route.tsx/
// route-overview.tsx), not an overlay, so this doesn't need to account for it.
const BOUNDS_PADDING = { top: 60, right: 60, bottom: 60, left: 60 };

/**
 * The riskiest, least-verifiable part of M5.4/M5.5 — a native map library with no Android SDK
 * or macOS on this machine to actually run it on (see docs/progress.md's verification notes).
 * Kept small and isolated for exactly that reason: everything else in the plan-route/route-
 * overview screens (profile picking, point state, the API call, polyline decoding) is plain
 * RN/TS, fully unit-testable; this component is the one piece verified by design (against
 * MapLibre's own real source, not guessed) rather than by a real run.
 */
export function RouteMap({
  origin,
  destination,
  routeLine,
  alternateRouteLine,
  onMapPress,
  currentPosition,
  hazards,
  onHazardPress,
}: Props) {
  // Priority: a live position always wins (active-trip following) over any bounds fit; then a
  // planned route's own line — small route zooms in, big route zooms out, rather than a fixed
  // zoom that leaves a short route too distant or clips a long one (design feedback, 2026-09-25);
  // then both ends of a route still being planned, so setting the second point never leaves the
  // first one off-screen; then whichever single point exists, same as before.
  const routePoints: MapPoint[] = [
    ...(routeLine?.map(([lon, lat]) => ({ lon, lat })) ?? []),
    ...(alternateRouteLine?.map(([lon, lat]) => ({ lon, lat })) ?? []),
  ];
  const planningPoints: MapPoint[] = origin && destination ? [origin, destination] : [];
  const bounds = currentPosition
    ? undefined
    : (boundsFor(routePoints) ?? boundsFor(planningPoints));

  const center = currentPosition ?? destination ?? origin;
  // A closer, street-level zoom while following a live position or a single point — a bounds fit
  // (above) picks its own zoom, so this only applies when there's no box to fit around yet.
  const zoom = currentPosition ? 16 : 12;

  function handlePress(event: NativeSyntheticEvent<PressEvent>): void {
    if (!onMapPress) return;
    const [lon, lat] = event.nativeEvent.lngLat;
    onMapPress({ lat, lon });
  }

  return (
    <MapLibreMap style={styles.map} mapStyle={config.mapStyleUrl} onPress={handlePress}>
      {bounds ? (
        <Camera bounds={bounds} padding={BOUNDS_PADDING} />
      ) : (
        <Camera center={center ? toLngLat(center) : undefined} zoom={zoom} />
      )}
      {routeLine && routeLine.length > 1 && (
        <GeoJSONSource id="route-line-source" data={{ type: 'LineString', coordinates: routeLine }}>
          <Layer
            type="line"
            id="route-line-layer"
            source="route-line-source"
            // Violet, not blue — blue read as a river against the base map's own water colour
            // (design decision, 2026-09-24).
            paint={{ 'line-color': '#A78BFA', 'line-width': 4 }}
          />
        </GeoJSONSource>
      )}
      {alternateRouteLine && alternateRouteLine.length > 1 && (
        <GeoJSONSource
          id="alternate-route-line-source"
          data={{ type: 'LineString', coordinates: alternateRouteLine }}
        >
          <Layer
            type="line"
            id="alternate-route-line-layer"
            source="alternate-route-line-source"
            paint={{ 'line-color': '#34D399', 'line-width': 4 }}
          />
        </GeoJSONSource>
      )}
      {origin && (
        <ViewAnnotation id="origin" lngLat={toLngLat(origin)}>
          <View style={[styles.pin, styles.originPin]} testID="origin-pin" />
        </ViewAnnotation>
      )}
      {destination && (
        <ViewAnnotation id="destination" lngLat={toLngLat(destination)}>
          <View style={[styles.pin, styles.destinationPin]} testID="destination-pin" />
        </ViewAnnotation>
      )}
      {currentPosition && (
        <ViewAnnotation id="current-position" lngLat={toLngLat(currentPosition)}>
          <View style={[styles.pin, styles.currentPositionPin]} testID="current-position-pin" />
        </ViewAnnotation>
      )}
      {hazards?.map((hazard) => (
        <ViewAnnotation
          key={hazard.id}
          id={`hazard-${hazard.id}`}
          lngLat={toLngLat(hazard.location)}
          onPress={() => onHazardPress?.(hazard.id)}
        >
          <View
            style={[
              styles.hazardMarker,
              { backgroundColor: HAZARD_MARKER_COLOR[hazardSeverityFor(hazard.type)] },
            ]}
            testID={`hazard-pin-${hazard.id}`}
          >
            <Text style={styles.hazardMarkerText}>!</Text>
          </View>
        </ViewAnnotation>
      ))}
    </MapLibreMap>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
  pin: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  originPin: {
    backgroundColor: '#38BDF8',
  },
  destinationPin: {
    backgroundColor: '#F5A623',
  },
  currentPositionPin: {
    backgroundColor: '#34D399',
  },
  hazardMarker: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hazardMarkerText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0B1220',
  },
});
