import {
  Camera,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  ViewAnnotation,
  type LngLat,
  type PressEvent,
} from '@maplibre/maplibre-react-native';
import type { NativeSyntheticEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { config } from '../config';

export interface MapPoint {
  readonly lat: number;
  readonly lon: number;
}

interface Props {
  readonly origin: MapPoint | undefined;
  readonly destination: MapPoint | undefined;
  /** Present only on the route-overview screen (M5.5) — the plan-route screen (M5.4) has no
   *  route yet, since planning one is the whole point of that screen. */
  readonly routeLine?: [lon: number, lat: number][];
  /** Absent on the route-overview screen — a planned route's origin/destination are fixed
   *  outcomes of `POST /routing/route-plans`, not editable by tapping the map afterwards. */
  readonly onMapPress?: (point: MapPoint) => void;
  /** The active-trip screen's live GPS fix (M5.6) — when present, the camera follows it instead
   *  of the static origin/destination the route was planned with, and it's drawn as its own
   *  marker rather than reusing the origin pin (a driver's live position drifts off the planned
   *  origin as soon as the trip starts). */
  readonly currentPosition?: MapPoint;
}

function toLngLat(point: MapPoint): LngLat {
  return [point.lon, point.lat];
}

/**
 * The riskiest, least-verifiable part of M5.4/M5.5 — a native map library with no Android SDK
 * or macOS on this machine to actually run it on (see docs/progress.md's verification notes).
 * Kept small and isolated for exactly that reason: everything else in the plan-route/route-
 * overview screens (profile picking, point state, the API call, polyline decoding) is plain
 * RN/TS, fully unit-testable; this component is the one piece verified by design (against
 * MapLibre's own real source, not guessed) rather than by a real run.
 */
export function RouteMap({ origin, destination, routeLine, onMapPress, currentPosition }: Props) {
  const center = currentPosition ?? destination ?? origin;
  // A closer, street-level zoom while following a live position — the whole planned route
  // doesn't need to stay in frame the way it does on the plan-route/route-overview screens.
  const zoom = currentPosition ? 16 : 12;

  function handlePress(event: NativeSyntheticEvent<PressEvent>): void {
    if (!onMapPress) return;
    const [lon, lat] = event.nativeEvent.lngLat;
    onMapPress({ lat, lon });
  }

  return (
    <MapLibreMap style={styles.map} mapStyle={config.mapStyleUrl} onPress={handlePress}>
      <Camera center={center ? toLngLat(center) : undefined} zoom={zoom} />
      {routeLine && routeLine.length > 1 && (
        <GeoJSONSource id="route-line-source" data={{ type: 'LineString', coordinates: routeLine }}>
          <Layer
            type="line"
            id="route-line-layer"
            source="route-line-source"
            paint={{ 'line-color': '#38BDF8', 'line-width': 4 }}
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
});
