import {
  Camera,
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
  readonly onMapPress: (point: MapPoint) => void;
}

function toLngLat(point: MapPoint): LngLat {
  return [point.lon, point.lat];
}

/**
 * The riskiest, least-verifiable part of M5.4 — a native map library with no Android SDK or
 * macOS on this machine to actually run it on (see docs/progress.md's M5.4 verification notes).
 * Kept small and isolated for exactly that reason: everything else in the plan-route screen
 * (profile picking, point state, the API call) is plain RN/TS, fully unit-testable; this
 * component is the one piece verified by design (against MapLibre's own real source, not
 * guessed) rather than by a real run.
 */
export function RouteMap({ origin, destination, onMapPress }: Props) {
  const center = destination ?? origin;

  function handlePress(event: NativeSyntheticEvent<PressEvent>): void {
    const [lon, lat] = event.nativeEvent.lngLat;
    onMapPress({ lat, lon });
  }

  return (
    <MapLibreMap style={styles.map} mapStyle={config.mapStyleUrl} onPress={handlePress}>
      <Camera center={center ? toLngLat(center) : undefined} zoom={12} />
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
});
