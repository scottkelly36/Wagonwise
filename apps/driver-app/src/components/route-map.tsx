import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Images,
  Layer,
  Map as MapLibreMap,
  ViewAnnotation,
  type LngLat,
  type LngLatBounds,
  type PressEvent,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import type { HazardTypeDto } from '@wagonwise/contracts/hazards';
import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import type { LayoutChangeEvent, NativeSyntheticEvent } from 'react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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

/** A crowd-sourced congestion report (Phase 1, docs/progress.md) — distinct in shape and colour
 *  from a `HazardMarker` (a round teal pin vs. a square red/amber one) so a driver can tell "slow
 *  traffic reported here" apart from "an obstruction here" at a glance. */
export interface CongestionMarker {
  readonly id: string;
  readonly location: MapPoint;
  readonly estimatedWaitMinutes: number;
}

/** A driver-vouched safe place to park an HGV (M9, docs/progress.md) — a third, visually distinct
 *  kind of marker: a square blue pin, unlike a hazard's square red/amber or congestion's round
 *  teal, so it reads as "a place," not a warning or a delay. */
export interface ParkingSpotMarker {
  readonly id: string;
  readonly location: MapPoint;
}

const HAZARD_MARKER_COLOR: Record<'high' | 'caution', string> = {
  high: '#F87171',
  caution: '#F59E0B',
};

/** One of several candidate routes drawn side by side, each in its own colour. */
export interface RouteOptionLine {
  readonly id: string;
  readonly line: [lon: number, lat: number][];
  readonly color: string;
}

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
  /** Route options being compared on the plan-route screen, before one is chosen: every option is
   *  drawn in its own colour (matching its card) and the camera fits them all. */
  readonly routeOptionLines?: readonly RouteOptionLine[];
  /** Absent on the route-overview screen — a planned route's origin/destination are fixed
   *  outcomes of `POST /routing/route-plans`, not editable by tapping the map afterwards. */
  readonly onMapPress?: (point: MapPoint) => void;
  /** The active-trip screen's live GPS fix (M5.6) — when present, the camera follows it instead
   *  of the static origin/destination the route was planned with, and it's drawn as its own
   *  marker rather than reusing the origin pin (a driver's live position drifts off the planned
   *  origin as soon as the trip starts). Panning or zooming manually while this is set drops out
   *  of following (design feedback, 2026-09-26: recentring on every fix fought a driver trying
   *  to look ahead) — a "Recenter" button reappears to opt back in; see `following` state below. */
  readonly currentPosition?: MapPoint;
  /** Which way the driver is facing, degrees clockwise from north. When known, the position is drawn
   *  as an arrow pointing that way instead of a plain dot. */
  readonly currentHeading?: number | undefined;
  /** The direction of travel from GPS, only while moving; undefined when stopped. While navigating the
   *  map turns to this and keeps its last value when it is undefined, so it does not spin when stopped. */
  readonly currentCourse?: number | undefined;
  /** Turn-by-turn driving (the trip screen): while following, the map turns to put the direction of
   *  travel at the top, tilts, and keeps the position low on the screen so most of it shows the road
   *  ahead. The camera follows the phone's own location natively, which is what keeps it smooth. The
   *  position is then a fixed arrow, always pointing up. */
  readonly navigating?: boolean;
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
  /** Crowd-sourced congestion reports (Phase 1) — same "caller decides the query, this component
   *  just draws what it's given" split as `hazards` above. Undefined everywhere until home.tsx
   *  wires it up; the plan-route/route-overview/active-trip screens don't get this yet (scoping,
   *  docs/progress.md: home screen only for this pass). */
  readonly congestion?: readonly CongestionMarker[];
  /** Fired when a congestion marker is tapped — no drawer yet (Phase 1 has nothing more to show
   *  than the wait estimate already on the marker itself), so undefined is a valid, common case. */
  readonly onCongestionPress?: (congestionId: string) => void;
  /** Driver-reported safe parking spots (M9) — same "caller decides the query, this component
   *  just draws what it's given" split as `hazards`/`congestion` above. */
  readonly parkingSpots?: readonly ParkingSpotMarker[];
  /** Fired when a parking-spot marker is tapped (the home screen opens `ParkingSpotDrawer`). Same as
   *  `onCongestionPress`. */
  readonly onParkingSpotPress?: (parkingSpotId: string) => void;
  /** Zoom while following `currentPosition`. A street-level 16 suits driving; the home map wants a
   *  wider, town-level view. */
  readonly followZoom?: number;
  /** Tells the parent whether the camera is following the position or has been panned away, so it
   *  can draw its own recentre control. Called from the gesture itself, never from an effect. */
  readonly onFollowingChange?: (following: boolean) => void;
  /** Hide the built-in "Recenter" button when the screen draws its own (via `ref`). */
  readonly hideRecenterButton?: boolean;
  /** Lets the parent put the camera back on the position: `ref.current?.recenter()`. */
  readonly ref?: Ref<RouteMapHandle>;
}

export interface RouteMapHandle {
  /** Resume following the live position after the driver has panned away. */
  recenter(): void;
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

// Turn-by-turn camera: tilted like a car sat-nav, with this fraction of the map's height added as
// padding at the top, which pushes the position down to about three quarters of the way down the
// screen so most of what is shown is the road ahead.
const NAV_PITCH_DEG = 45;
const NAV_TOP_PADDING_FRACTION = 0.45;
const NAV_ARROW_SIZE = 40;
const NAV_EASE_MS = 1100;

// The arrow drawn at the driver's position on the north-up maps: a picture made by
// scripts/make-heading-arrow.js, drawn at a third of its size (it is 128 px for sharpness).
const HEADING_ARROW_IMAGE = require('../../assets/images/heading-arrow.png') as number;
const HEADING_ARROW_SCALE = 0.34;

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
  routeOptionLines,
  onMapPress,
  currentPosition,
  currentHeading,
  currentCourse,
  navigating = false,
  hazards,
  onHazardPress,
  congestion,
  onCongestionPress,
  parkingSpots,
  onParkingSpotPress,
  followZoom = 16,
  onFollowingChange,
  hideRecenterButton = false,
  ref,
}: Props) {
  // Whether the camera is actively tracking `currentPosition` — true until the driver manually
  // pans/zooms (see `handleRegionWillChange`), at which point it stays false (their view stays
  // put) until they tap "Recenter". Meaningless when there's no `currentPosition` at all, but
  // harmless to keep around either way — nothing reads it in that case.
  const [following, setFollowingState] = useState(true);
  function setFollowing(next: boolean): void {
    setFollowingState(next);
    onFollowingChange?.(next);
  }
  useImperativeHandle(ref, () => ({ recenter: () => setFollowing(true) }));

  // The map's height, to know where the camera's anchor is on the screen (see `NAV_TOP_PADDING_FRACTION`).
  const [mapHeight, setMapHeight] = useState(0);
  function handleLayout(event: LayoutChangeEvent): void {
    setMapHeight(event.nativeEvent.layout.height);
  }
  const navTopPadding = Math.round(mapHeight * NAV_TOP_PADDING_FRACTION);
  const navPadding = useMemo(
    () => ({ top: navTopPadding, right: 0, bottom: 0, left: 0 }),
    [navTopPadding],
  );

  // GeoJSON sources get a new `data` object every render otherwise, and each one is sent to the map
  // again. With a position update every second that was visible as a stutter.
  const routeData = useMemo(
    () => (routeLine ? { type: 'LineString' as const, coordinates: routeLine } : undefined),
    [routeLine],
  );
  const alternateData = useMemo(
    () =>
      alternateRouteLine
        ? { type: 'LineString' as const, coordinates: alternateRouteLine }
        : undefined,
    [alternateRouteLine],
  );
  const optionData = useMemo(
    () =>
      routeOptionLines?.map((o) => ({
        option: o,
        data: { type: 'LineString' as const, coordinates: o.line },
      })),
    [routeOptionLines],
  );

  // Priority: a live position always wins (active-trip following) over any bounds fit; then a
  // planned route's own line — small route zooms in, big route zooms out, rather than a fixed
  // zoom that leaves a short route too distant or clips a long one (design feedback, 2026-09-25);
  // then whichever single point exists.
  //
  // Deliberately *not* fitting origin+destination in a box while a route is still being planned
  // (tried that, design feedback 2026-09-25) — on the plan-route screen a driver picking a
  // destination has usually just panned/zoomed the map to find it, and re-fitting bounds the
  // moment they tap moves the camera out from under them, reading as an unwanted zoom-out
  // (design feedback, 2026-09-26). The camera just stays where it is until a real route exists.
  const routePoints: MapPoint[] = [
    ...(routeLine?.map(([lon, lat]) => ({ lon, lat })) ?? []),
    ...(alternateRouteLine?.map(([lon, lat]) => ({ lon, lat })) ?? []),
    ...(routeOptionLines?.flatMap((o) => o.line.map(([lon, lat]) => ({ lon, lat }))) ?? []),
  ];
  const bounds = currentPosition ? undefined : boundsFor(routePoints);

  // Origin rather than destination, so setting/changing the destination doesn't recenter the map
  // (see above) — origin is usually already fixed (current location, or set first) by the time a
  // destination is picked, so this mostly only moves the camera once, early.
  const center = currentPosition ?? origin ?? destination;
  // A closer, street-level zoom while following a live position or a single point — a bounds fit
  // (above) picks its own zoom, so this only applies when there's no box to fit around yet.
  const zoom = currentPosition ? followZoom : 12;
  // Once out of following, this component simply stops issuing camera stops at all — passing no
  // `center`/`zoom` leaves the map exactly where the driver's own gesture left it, rather than
  // fighting it every time `currentPosition` ticks (every ~3s/10m, `useLiveLocation`).
  const isFreeLooking = currentPosition !== undefined && !following;
  const navTracking = navigating && currentPosition !== undefined && following;

  // While navigating the camera is moved here, once a second as a fix arrives: centred on the driver's
  // position, turned to their direction of travel, tilted, with the position held low on the screen.
  // The arrow overlay is fixed where the camera keeps the position, so they always coincide.
  const cameraRef = useRef<CameraRef>(null);
  const lastBearing = useRef(0);
  const lat = currentPosition?.lat;
  const lon = currentPosition?.lon;
  useEffect(() => {
    if (!navTracking || lat === undefined || lon === undefined) return;
    // The last known course, so the map holds its direction when the lorry stops instead of spinning.
    if (currentCourse !== undefined) lastBearing.current = currentCourse;
    const bearing = lastBearing.current;
    // A little longer than the gap between fixes, so each move runs into the next: a steady glide.
    try {
      cameraRef.current?.easeTo({
        center: [lon, lat],
        bearing,
        zoom: followZoom,
        pitch: NAV_PITCH_DEG,
        padding: navPadding,
        duration: NAV_EASE_MS,
        easing: 'linear',
      });
    } catch {
      // The map is not ready yet (the first fix can arrive before it has loaded): the next fix, a
      // second later, moves the camera.
    }
  }, [navTracking, lat, lon, currentCourse, followZoom, navPadding]);
  // The arrow is a native map layer (below), not a React Native marker, so it can be turned smoothly.
  const showArrowLayer =
    currentPosition !== undefined && !navTracking && !navigating && currentHeading !== undefined;
  const arrowData = useMemo(
    () =>
      currentPosition
        ? { type: 'Point' as const, coordinates: [currentPosition.lon, currentPosition.lat] }
        : undefined,
    [currentPosition],
  );
  // Anchor of the camera on screen when tracking: the middle of the area left under the top padding.
  const navAnchorY = (mapHeight + navTopPadding) / 2;

  function handlePress(event: NativeSyntheticEvent<PressEvent>): void {
    if (!onMapPress) return;
    const [lon, lat] = event.nativeEvent.lngLat;
    onMapPress({ lat, lon });
  }

  // `userInteraction` is only true for an actual touch-driven gesture, never for this
  // component's own programmatic camera moves — exactly the signal needed to tell "the driver
  // just grabbed the map" apart from "the camera just followed a new fix".
  function handleRegionWillChange(event: NativeSyntheticEvent<ViewStateChangeEvent>): void {
    if (event.nativeEvent.userInteraction) setFollowing(false);
  }

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <MapLibreMap
        style={styles.map}
        mapStyle={config.mapStyleUrl}
        onPress={handlePress}
        onRegionWillChange={handleRegionWillChange}
      >
        {navTracking ? (
          // Moved by the effect above, from our own position fixes, not by the phone's location engine
          // (tried: it showed its own dot and left the camera where it was).
          <Camera ref={cameraRef} zoom={followZoom} pitch={NAV_PITCH_DEG} padding={navPadding} />
        ) : bounds ? (
          <Camera bounds={bounds} padding={BOUNDS_PADDING} />
        ) : (
          <Camera
            center={isFreeLooking || !center ? undefined : toLngLat(center)}
            zoom={isFreeLooking ? undefined : zoom}
          />
        )}
        {routeData && routeLine && routeLine.length > 1 && (
          <GeoJSONSource id="route-line-source" data={routeData}>
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
        {alternateData && alternateRouteLine && alternateRouteLine.length > 1 && (
          <GeoJSONSource id="alternate-route-line-source" data={alternateData}>
            <Layer
              type="line"
              id="alternate-route-line-layer"
              source="alternate-route-line-source"
              paint={{ 'line-color': '#34D399', 'line-width': 4 }}
            />
          </GeoJSONSource>
        )}
        {optionData?.map(({ option, data }) =>
          option.line.length > 1 ? (
            <GeoJSONSource key={option.id} id={`route-option-source-${option.id}`} data={data}>
              {/* A white edge under the colour, so each line stands out from roads and water. */}
              <Layer
                type="line"
                id={`route-option-casing-${option.id}`}
                source={`route-option-source-${option.id}`}
                paint={{ 'line-color': '#FFFFFF', 'line-width': 8 }}
              />
              <Layer
                type="line"
                id={`route-option-layer-${option.id}`}
                source={`route-option-source-${option.id}`}
                paint={{ 'line-color': option.color, 'line-width': 5 }}
              />
            </GeoJSONSource>
          ) : null,
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
        {showArrowLayer && arrowData && (
          <>
            <Images images={{ 'heading-arrow': HEADING_ARROW_IMAGE }} />
            {/* Drawn by the map itself and turned with `icon-rotate`. A React Native marker is drawn once to a
                picture on Android, so turning it meant replacing it, which flickered (found on a phone). */}
            <GeoJSONSource id="heading-arrow-source" data={arrowData}>
              <Layer
                type="symbol"
                id="heading-arrow-layer"
                source="heading-arrow-source"
                layout={{
                  'icon-image': 'heading-arrow',
                  'icon-rotate': currentHeading ?? 0,
                  'icon-rotation-alignment': 'map',
                  'icon-allow-overlap': true,
                  'icon-ignore-placement': true,
                  'icon-size': HEADING_ARROW_SCALE,
                }}
              />
            </GeoJSONSource>
          </>
        )}
        {currentPosition && !navTracking && !showArrowLayer && (
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
        {congestion?.map((report) => (
          <ViewAnnotation
            key={report.id}
            id={`congestion-${report.id}`}
            lngLat={toLngLat(report.location)}
            onPress={() => onCongestionPress?.(report.id)}
          >
            <View style={styles.congestionMarker} testID={`congestion-pin-${report.id}`}>
              <Text style={styles.congestionMarkerText}>{report.estimatedWaitMinutes}m</Text>
            </View>
          </ViewAnnotation>
        ))}
        {parkingSpots?.map((spot) => (
          <ViewAnnotation
            key={spot.id}
            id={`parking-${spot.id}`}
            lngLat={toLngLat(spot.location)}
            onPress={() => onParkingSpotPress?.(spot.id)}
          >
            <View
              style={[styles.parkingMarker, navigating && styles.parkingMarkerSmall]}
              testID={`parking-pin-${spot.id}`}
            >
              <Text style={[styles.parkingMarkerText, navigating && styles.parkingMarkerTextSmall]}>
                P
              </Text>
            </View>
          </ViewAnnotation>
        ))}
      </MapLibreMap>
      {navTracking && mapHeight > 0 && (
        // Fixed on the screen where the camera keeps the position, so it does not jump with each fix
        // the way a map marker would. The map turns, so the arrow always points up.
        <View
          pointerEvents="none"
          style={[styles.navArrowAnchor, { top: navAnchorY - NAV_ARROW_SIZE / 2 }]}
        >
          <View style={styles.headingPuck} testID="current-position-arrow">
            <MaterialCommunityIcons name="navigation" size={26} color="#1A73E8" />
          </View>
        </View>
      )}
      {isFreeLooking && !hideRecenterButton && (
        <TouchableOpacity
          style={styles.recenterButton}
          onPress={() => setFollowing(true)}
          testID="recenter-button"
        >
          <Text style={styles.recenterButtonText}>Recenter</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  // Floats over the (unthemed) map, same reasoning as the other map-overlay buttons elsewhere
  // in the app (e.g. home.tsx's menu button) — a fixed dark pill regardless of the app's own
  // light/dark theme, legible against the map's own imagery either way.
  recenterButton: {
    position: 'absolute',
    top: 56,
    right: 16,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(11, 18, 32, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recenterButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
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
  // A white disc with the arrow turned inside it: reads against any map colour, and only the arrow
  // rotates, never the disc.
  navArrowAnchor: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  headingPuck: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0B1220',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
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
  // Round and teal, deliberately unlike the square red/amber hazardMarker above — a different
  // shape reads as "a different kind of thing" at a glance, not just a different colour of the
  // same warning icon.
  congestionMarker: {
    minWidth: 36,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#2DD4BF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  congestionMarkerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0B1220',
  },
  // Square and blue, unlike either the square red/amber hazardMarker or the round teal
  // congestionMarker above — a place to park reads as neither a warning nor a delay.
  parkingMarker: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // While driving the map is busy and the lorry is moving: the same marker, smaller, so a row of
  // parking spots along the route does not crowd the road.
  parkingMarkerSmall: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5 },
  parkingMarkerTextSmall: { fontSize: 12 },
  parkingMarkerText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
