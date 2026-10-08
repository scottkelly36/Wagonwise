import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEndTrip } from '../api/use-active-trip';
import { useAdvanceJobStatus, useCurrentJob } from '../api/use-jobs';
import { useNearbyHazards } from '../api/use-hazards';
import { useNearbySafeParkingSpots } from '../api/use-parking';
import { ACTION_COLOURS, ActionCard } from '../components/ui/action-card';
import { HazardDetailDrawer } from '../components/hazard-detail-drawer';
import { ParkingSpotDrawer } from '../components/parking-spot-drawer';
import { MarkPlaceSheet } from '../components/mark-place-sheet';
import { PlaceSheet } from '../components/place-sheet';
import { useMyPlaces } from '../api/use-places';
import type { SavedPlaceDto } from '@wagonwise/contracts/places';
import { thinPoints } from '../lib/thin-points';
import { OpenSettingsButton } from '../components/open-settings-button';
import { PositionSharingChip } from '../components/position-sharing-chip';
import { isSharingPosition } from '../lib/job-position-reporting';
import { TurnBanner } from '../components/turn-banner';
import { RouteMap, type RouteMapHandle } from '../components/route-map';
import { RoundButton } from '../components/ui/round-button';
import { useHazardVoiceWarnings } from '../hooks/use-hazard-voice-warnings';
import { useLiveLocation } from '../hooks/use-live-location';
import { useQuickVoiceReport } from '../hooks/use-quick-voice-report';
import { useReplanFromHere } from '../hooks/use-replan-from-here';
import { useTurnAnnouncements } from '../hooks/use-turn-announcements';
import { useTurnGuidance } from '../hooks/use-turn-guidance';
import { useVoiceHazardReportFlow } from '../hooks/use-voice-hazard-report-flow';
import { MIC_OFF_MESSAGE } from '../lib/mic-off-message';
import { computeEta } from '../lib/eta';
import { arrivalStep, navigationTarget } from '../lib/job-navigation';
import { jobsErrorMessage, routingErrorMessage } from '../lib/error-messages';
import { formatTime } from '../lib/format-date';
import { formatMeasurement, HAZARD_TYPE_LABELS } from '../lib/hazard-labels';
import {
  activeKind as activeQuickReportKind,
  isBusy as isQuickReportBusy,
  isListening as isQuickReportListening,
  outcomeMessage as quickReportOutcome,
  type QuickReportKind,
  type QuickVoiceReportState,
} from '../lib/quick-voice-report-reducer';
import { decodePolyline6 } from '../lib/polyline';
import { routeProgress } from '../lib/route-progress';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useGuidanceStore } from '../state/guidance-store';
import { Icon, type IconName } from '../components/ui/icon';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';

// Short, since three share one row over the map; the fuller wording is in the notes above them.
const VOICE_FLOW_LABEL: Record<string, string> = {
  idle: 'Report hazard',
  'capturing-report': 'Listening…',
  'report-no-speech': 'Try again',
  parsing: 'Working…',
  'speaking-summary': 'Confirm…',
  'capturing-confirmation': 'Listening…',
  filing: 'Saving…',
  filed: 'Report hazard',
  queued: 'Report hazard',
  'draft-saved': 'Report hazard',
  error: 'Try again',
};

const QUICK_REPORT_ICON: Record<QuickReportKind, IconName> = {
  traffic: 'alert',
  parking: 'parking',
};

const QUICK_REPORT_LABEL: Record<QuickReportKind, string> = {
  traffic: 'Traffic',
  parking: 'Parking',
};

/** The label for one quick-report button: its own name when idle (or while the other kind is
 *  running), progress text while its own report is in flight. */
function quickReportButtonLabel(kind: QuickReportKind, state: QuickVoiceReportState): string {
  if (activeQuickReportKind(state) !== kind) return QUICK_REPORT_LABEL[kind];
  switch (state.phase) {
    case 'asking-wait':
    case 'confirming':
      return 'Speaking…';
    case 'capturing-wait':
    case 'capturing-confirmation':
      return 'Listening…';
    case 'filing':
      return 'Sending…';
    default:
      return QUICK_REPORT_LABEL[kind];
  }
}

// A phase the driver can tap out of before it reaches its own natural end — every other phase
// either runs to completion on its own or is a resting state where tapping starts a fresh report.
const CANCELLABLE_PHASES = new Set(['capturing-report', 'capturing-confirmation']);

// "On your route" (design decision, 2026-09-24) — wider than a routing-avoidance check (30m,
// design doc §5), since this is just an on-map warning icon, not a decision to reroute around.
const ON_ROUTE_HAZARD_RADIUS_M = 750;
// Under the server's limit of 2000 corridor points per request.
const CORRIDOR_MAX_POINTS = 1500;
// Parking a little further out than hazards: a layby just off the route is worth seeing.
const ON_ROUTE_PARKING_RADIUS_M = 1500;

/**
 * The active-trip screen (design doc §8, M5.6): a map following the driver's live position, an
 * upcoming-hazards list, and a real "End trip" button. Reroute prompts arrive as M6.6's own
 * screen (`app/reroute/[id].tsx`), reached via notification, not from here. The mic button now
 * drives the full voice-report flow (M7.3): capture, parse, speak a confirmation back, listen for
 * yes/no, then file or save an unconfirmed draft — design doc §7 steps 1-4 end to end.
 */
export default function ActiveTripScreen() {
  // For as long as this screen is mounted, i.e. for the life of the trip — a driver glancing at
  // the map every few minutes shouldn't have to unlock their phone each time (field feedback,
  // 2026-09-26). Released automatically on unmount (ending the trip, or navigating away).
  useKeepAwake();

  const router = useRouter();
  const trip = useCurrentActiveTripStore((s) => s.trip);
  const clearTrip = useCurrentActiveTripStore((s) => s.clear);
  const plan = useCurrentRoutePlanStore((s) => s.plan);
  const clearPlan = useCurrentRoutePlanStore((s) => s.clear);
  const location = useLiveLocation({ fast: true });
  const endTrip = useEndTrip();
  // A company job being driven (the "Start" on the job screen): the arrival is confirmed from here,
  // so a driver never has to leave the navigation to tell dispatch they have got there.
  const job = useCurrentJob();
  const advanceJob = useAdvanceJobStatus();
  const arrival = job.data ? arrivalStep(job.data.status) : undefined;
  const voiceFlow = useVoiceHazardReportFlow(location.point);
  const quickReport = useQuickVoiceReport(location.point);

  // decodePolyline6 is a pure function of plan.geometry — no need to redo it on every
  // unrelated re-render (e.g. a location update).
  const routeLine = useMemo(() => (plan ? decodePolyline6(plan.geometry) : undefined), [plan]);
  // The route as the corridor for "what is near it" requests, thinned to fit: the server takes at most
  // 2000 points and a route across Britain has tens of thousands, which would have failed outright.
  const corridor = useMemo(
    () => thinPoints(routeLine?.map(([lon, lat]) => ({ lat, lon })) ?? [], CORRIDOR_MAX_POINTS),
    [routeLine],
  );
  const nearbyHazards = useNearbyHazards(corridor, ON_ROUTE_HAZARD_RADIUS_M);
  // Safe parking along the route, so a spot marked while driving is on the map where it was marked.
  // Thinned: the request takes at most 2000 points and a long route has more.
  const nearbyParking = useNearbySafeParkingSpots(corridor, ON_ROUTE_PARKING_RADIUS_M);
  const mapParking = useMemo(
    () => nearbyParking.data?.map((s) => ({ id: s.id, location: s.location })),
    [nearbyParking.data],
  );
  // Whether the map is following the driver. When they move it away, a Recenter button appears; it is
  // gone again as soon as the map is following. (The map's own small button sat under the turn card.)
  const mapRef = useRef<RouteMapHandle>(null);
  const [following, setFollowing] = useState(true);
  const myPlaces = useMyPlaces();
  const mapPlaces = useMemo(
    () => myPlaces.places.map((p) => ({ id: p.id, category: p.category, location: p.location })),
    [myPlaces.places],
  );
  const [selectedPlace, setSelectedPlace] = useState<SavedPlaceDto | undefined>(undefined);
  const [markingPlace, setMarkingPlace] = useState(false);
  const [selectedParkingId, setSelectedParkingId] = useState<string | undefined>(undefined);
  const selectedParking = nearbyParking.data?.find((s) => s.id === selectedParkingId);
  const nearbyHazardsData = nearbyHazards.data;
  // A stable array: a new one every render (once a second, with the position) made every hazard
  // marker update on the map each time.
  const mapHazards = useMemo(
    () => nearbyHazardsData?.map((h) => ({ id: h.id, type: h.type, location: h.location })),
    [nearbyHazardsData],
  );
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // `plan.hazardsOnRoute` is the authoritative "on this route" list (a real, ~30m-of-the-final-
  // route server query) but it's bare ids, nothing a driver can read. Cross-referencing against
  // `nearbyHazards`' fuller objects (already fetched for the map markers and the voice-warning
  // hook, a broader ~750m corridor check) gets a readable label without a second request — an id
  // that's since been dismissed/expired just doesn't render, which is correct for something no
  // longer actually there.
  const hazardsOnRoute = useMemo(() => {
    if (!plan || !nearbyHazardsData) return [];
    // Keyed by plain `string`, not the branded `HazardReportId` `hazard.id` actually is — the
    // ids traveling through `plan.hazardsOnRoute` are plain strings on the wire (`z.string()`,
    // not the branded schema), so the lookup below needs a plain-string key to match against.
    const byId = new Map<string, NonNullable<typeof nearbyHazardsData>[number]>(
      nearbyHazardsData.map((hazard) => [hazard.id, hazard]),
    );
    return plan.hazardsOnRoute
      .map((id) => byId.get(id))
      .filter((hazard): hazard is NonNullable<typeof hazard> => hazard !== undefined);
  }, [plan, nearbyHazardsData]);

  // Live-updating ETA (part 2 of the planning-time one on route-overview.tsx): re-derived from
  // the driver's live position every time it updates (useLiveLocation, every ~3s/10m), by
  // snapping onto the route line and scaling the plan's total duration by how much of it is
  // left. No live position yet (denied/loading) falls back to the full planned duration from
  // now, rather than showing nothing.
  const progress = useMemo(
    () => (routeLine && location.point ? routeProgress(routeLine, location.point) : undefined),
    [routeLine, location.point],
  );
  const remainingDurationMin = plan ? plan.durationMin * (progress?.remainingFraction ?? 1) : 0;
  const eta = plan ? computeEta(new Date(), remainingDurationMin) : undefined;
  const remainingKm = progress ? progress.remainingMetres / 1000 : plan?.distanceKm;

  const micBusy =
    voiceFlow.state.phase === 'parsing' ||
    voiceFlow.state.phase === 'speaking-summary' ||
    voiceFlow.state.phase === 'filing';
  const micActive = CANCELLABLE_PHASES.has(voiceFlow.state.phase);
  const quickBusy = isQuickReportBusy(quickReport.state);
  const quickListening = isQuickReportListening(quickReport.state);
  const quickInFlight = quickBusy || quickListening;
  // Muted while any voice report is listening or speaking — talking over that would be worse
  // than a missed warning.
  useHazardVoiceWarnings(
    routeLine,
    location.point,
    nearbyHazardsData,
    !micBusy && !micActive && !quickInFlight,
  );

  // Spoken turns and the turn card (P2-M10). Muted by the driver's toggle, and while a voice report
  // is listening or speaking, for the same reason as the hazard warnings above.
  const guidance = useTurnGuidance(routeLine, plan?.maneuvers, location.point);
  const voiceMuted = useGuidanceStore((s) => s.muted);
  const setVoiceMuted = useGuidanceStore((s) => s.setMuted);
  const replan = useReplanFromHere();
  useTurnAnnouncements(guidance.utterance, !voiceMuted && !micBusy && !micActive && !quickInFlight);

  const quickCard = (kind: QuickReportKind) => {
    const ownListening = quickListening && activeQuickReportKind(quickReport.state) === kind;
    const disabled = micBusy || micActive || quickBusy || (quickListening && !ownListening);
    return (
      <ActionCard
        key={kind}
        compact
        icon={QUICK_REPORT_ICON[kind]}
        iconColor={ACTION_COLOURS[kind]}
        label={quickReportButtonLabel(kind, quickReport.state)}
        active={ownListening}
        disabled={disabled}
        onPress={() => (ownListening ? quickReport.cancel() : quickReport.start(kind))}
        testID={'quick-report-' + kind}
      />
    );
  };

  // Reachable with no current trip/plan only by navigating here directly, or after an app
  // relaunch mid-trip — the trip store is ephemeral (docs/progress.md, M5.6 deviations) and
  // doesn't survive one. Nothing to show, so send the driver back to plan a route rather than
  // rendering a blank screen.
  if (!trip || !plan) {
    return <Redirect href="/plan-route" />;
  }

  function handleArrived(): void {
    if (!job.data || !arrival || advanceJob.isPending || endTrip.isPending) return;
    advanceJob.mutate(
      { jobId: job.data.id, status: arrival.to },
      {
        onSuccess: () => {
          // Arrived: the trip to this stop is over. The job screen has the next step.
          const finish = () => {
            clearTrip();
            clearPlan();
            router.replace('/job');
          };
          if (trip) endTrip.mutate(trip.id, { onSuccess: finish });
          else finish();
        },
      },
    );
  }

  function handleEndTrip(): void {
    if (!trip || endTrip.isPending) return;
    endTrip.mutate(trip.id, {
      onSuccess: () => {
        clearTrip();
        clearPlan();
        router.replace('/home');
      },
    });
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapArea}>
        <RouteMap
          ref={mapRef}
          onFollowingChange={setFollowing}
          hideRecenterButton
          origin={plan.origin}
          destination={plan.destination}
          routeLine={routeLine}
          currentPosition={location.point}
          currentCourse={location.course}
          navigating
          hazards={mapHazards}
          parkingSpots={mapParking}
          onParkingSpotPress={setSelectedParkingId}
          places={mapPlaces}
          onPlacePress={(id) => setSelectedPlace(myPlaces.places.find((p) => p.id === id))}
          onHazardPress={setSelectedHazardId}
        />

        <View style={[styles.turnBanner, { top: insets.top + 8 }]} pointerEvents="box-none">
          <TurnBanner
            next={guidance.next}
            offRoute={guidance.offRoute}
            muted={voiceMuted}
            replanning={replan.isPending}
            replanFailed={replan.isError}
            onToggleMute={() => void setVoiceMuted(!voiceMuted)}
            onReplan={() => {
              if (location.point)
                replan.mutate({ here: location.point, headingDeg: location.course });
            }}
          />
        </View>

        {/* Always there, on the map and not behind a menu: mark the spot you are on (a farm gate, a yard
            entrance). Recenter joins it below once the map has been moved away. */}
        <View
          style={[
            styles.recenter,
            { top: insets.top + (guidance.next || guidance.offRoute ? 96 : 8) },
          ]}
          pointerEvents="box-none"
        >
          <RoundButton
            icon="map-marker-plus-outline"
            label="Mark a place here"
            onPress={() => setMarkingPlace(true)}
            testID="mark-place-button"
          />
          {!following && (
            <RoundButton
              icon="crosshairs-gps"
              label="Centre the map on me"
              onPress={() => mapRef.current?.recenter()}
              testID="recenter-button"
            />
          )}
        </View>

        {eta && (
          <View
            style={[
              styles.etaCard,
              { top: insets.top + (guidance.next || guidance.offRoute ? 96 : 8) },
            ]}
            testID="active-trip-eta"
          >
            <Icon name="clock-outline" size={26} color={colors.accent} />
            <View>
              <Text style={styles.etaTime}>ETA {formatTime(eta)}</Text>
              <Text style={styles.etaDistance}>{remainingKm?.toFixed(1)} km left</Text>
            </View>
          </View>
        )}

        <MarkPlaceSheet
          visible={markingPlace}
          onClose={() => setMarkingPlace(false)}
          stopName={job.data ? navigationTarget(job.data)?.stop.name : undefined}
          companyId={myPlaces.markingCompanyId}
        />

        <PlaceSheet
          place={selectedPlace}
          onClose={() => setSelectedPlace(undefined)}
          shareCompanyId={myPlaces.markingCompanyId}
        />

        <ParkingSpotDrawer spot={selectedParking} onClose={() => setSelectedParkingId(undefined)} />

        <HazardDetailDrawer
          hazardId={selectedHazardId}
          onClose={() => setSelectedHazardId(undefined)}
        />

        {/* Semi-visible overlay, not a solid full-width bar (design decision, 2026-09-24) — the
            mic is available throughout a trip, but shouldn't compete with the map for attention
            until a driver actually wants it. */}
        <View style={styles.micOverlay} pointerEvents="box-none">
          {voiceFlow.state.phase === 'speaking-summary' && (
            <Text style={styles.overlayFootnote} testID="voice-report-summary">
              “{voiceFlow.state.summary}”
            </Text>
          )}
          {voiceFlow.state.phase === 'filed' && (
            <Text style={styles.overlayFootnote} testID="voice-report-status">
              Saved.
            </Text>
          )}
          {voiceFlow.state.phase === 'queued' && (
            <Text style={styles.overlayFootnote} testID="voice-report-status">
              Saved — this will be sent automatically once you’re back online.
            </Text>
          )}
          {voiceFlow.state.phase === 'draft-saved' && (
            <Text style={styles.overlayFootnote} testID="voice-report-status">
              Not filed — saved as a draft to review when you’re parked.
            </Text>
          )}
          {voiceFlow.state.phase === 'error' && (
            <Text style={styles.overlayFootnote}>{voiceFlow.state.message}</Text>
          )}
          {(voiceFlow.state.phase === 'error' && voiceFlow.state.message === MIC_OFF_MESSAGE) ||
          (quickReport.state.phase === 'error' && quickReport.state.message === MIC_OFF_MESSAGE) ? (
            <OpenSettingsButton />
          ) : null}
          {quickReport.state.phase === 'confirming' && (
            <Text style={styles.overlayFootnote} testID="quick-report-prompt">
              “{quickReport.state.prompt}”
            </Text>
          )}
          {quickReportOutcome(quickReport.state) !== undefined && (
            <Text style={styles.overlayFootnote} testID="quick-report-status">
              {quickReportOutcome(quickReport.state)}
            </Text>
          )}
          {quickReport.canUndoParking && (
            <TouchableOpacity
              style={styles.undoButton}
              onPress={quickReport.undoParking}
              accessibilityRole="button"
              testID="undo-parking-button"
            >
              <Text style={styles.undoButtonText}>Undo</Text>
            </TouchableOpacity>
          )}

          {/* Traffic, hazard and parking: the same cards as the home screen, a size smaller so
              they cover less of the map. One tap each, then entirely by voice (AGENTS.md: nothing
              on this screen needs typing or small taps while moving). Only one voice report runs at
              a time; a card being listened to turns red and cancels on a second tap. */}
          <View style={styles.quickReportRow}>
            {quickCard('traffic')}
            <ActionCard
              compact
              icon="microphone"
              iconColor={ACTION_COLOURS.hazard}
              label={VOICE_FLOW_LABEL[voiceFlow.state.phase]}
              active={micActive}
              disabled={micBusy || quickInFlight}
              onPress={micActive ? voiceFlow.reset : voiceFlow.start}
              testID="voice-report-button"
            />
            {quickCard('parking')}
          </View>
        </View>
      </View>

      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        {job.data && isSharingPosition(job.data.status, true) && <PositionSharingChip />}

        {location.status === 'denied' && (
          <Text style={styles.hint}>
            Location access is off, so the map won’t follow you — road signs and your own judgement
            still apply.
          </Text>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hazards on this route</Text>
          {hazardsOnRoute.length === 0 ? (
            <Text style={styles.sectionEmpty}>None reported.</Text>
          ) : (
            hazardsOnRoute.map((hazard) => (
              <TouchableOpacity
                key={hazard.id}
                onPress={() => setSelectedHazardId(hazard.id)}
                testID={`hazard-list-item-${hazard.id}`}
              >
                <View style={styles.hazardRow}>
                  <Icon name="alert-outline" size={22} color={colors.warning} />
                  <Text style={styles.sectionItem}>
                    {HAZARD_TYPE_LABELS[hazard.type]}
                    {hazard.measurement ? ` · ${formatMeasurement(hazard.measurement)}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {job.data && arrival && (
          <View style={styles.jobBar} testID="trip-job-bar">
            <Text style={styles.jobBarText}>Job {job.data.reference}</Text>
            {advanceJob.isError && (
              <Text style={styles.error}>{jobsErrorMessage(advanceJob.error)}</Text>
            )}
            <TouchableOpacity
              style={[
                styles.button,
                (advanceJob.isPending || endTrip.isPending) && styles.buttonDisabled,
              ]}
              disabled={advanceJob.isPending || endTrip.isPending}
              onPress={handleArrived}
              testID="trip-arrived-button"
            >
              {advanceJob.isPending ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Text style={styles.buttonText}>{arrival.label}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {endTrip.isError && <Text style={styles.error}>{routingErrorMessage(endTrip.error)}</Text>}

        <TouchableOpacity
          style={[styles.endButton, endTrip.isPending && styles.buttonDisabled]}
          disabled={endTrip.isPending}
          onPress={handleEndTrip}
          testID="end-trip-button"
        >
          {endTrip.isPending ? (
            <ActivityIndicator color={colors.danger} />
          ) : (
            <Text style={styles.endButtonText}>End trip</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    mapArea: {
      flex: 1,
      position: 'relative',
    },
    micOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 24,
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
    },
    // The mic overlay floats on top of the map itself, not the themed chrome around it — kept as
    // fixed dark/translucent values in both themes so it stays legible against the map's own
    // (unthemed) imagery rather than washing out against a light background.
    overlayFootnote: {
      fontSize: 13,
      color: '#E5E7EB',
      textAlign: 'center',
      backgroundColor: 'rgba(11, 18, 32, 0.85)',
      borderRadius: 12,
      padding: 10,
    },
    // Big enough to hit while driving: it is only there for a few seconds after marking parking.
    undoButton: {
      minHeight: 48,
      paddingHorizontal: 28,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    undoButtonText: { fontSize: 18, fontWeight: '700', color: colors.textOnAccent },
    panel: {
      ...cardStyle(colors),
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 12,
    },
    // Under the turn card, on the right, clear of the ETA card on the left.
    recenter: { position: 'absolute', right: 16, gap: 12 },
    turnBanner: { position: 'absolute', left: 16, right: 16 },
    etaCard: {
      ...cardStyle(colors),
      position: 'absolute',
      left: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    etaTime: { fontSize: 20, fontWeight: '800', color: colors.text },
    etaDistance: { fontSize: 14, color: colors.textMuted },
    hazardRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    hint: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },
    section: {
      gap: 4,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    sectionEmpty: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    sectionItem: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    quickReportRow: {
      flexDirection: 'row',
      gap: 8,
      alignSelf: 'stretch',
    },
    jobBar: {
      gap: 8,
    },
    jobBarText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    button: {
      minHeight: 52,
      backgroundColor: colors.accent,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    endButton: {
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.danger,
      justifyContent: 'center',
      alignItems: 'center',
    },
    endButtonText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.danger,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    error: {
      fontSize: 16,
      color: colors.danger,
      textAlign: 'center',
    },
  });
}
