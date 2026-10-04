import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useEndTrip } from '../api/use-active-trip';
import { useAdvanceJobStatus, useCurrentJob } from '../api/use-jobs';
import { useNearbyHazards } from '../api/use-hazards';
import { HazardDetailDrawer } from '../components/hazard-detail-drawer';
import { RouteMap } from '../components/route-map';
import { useHazardVoiceWarnings } from '../hooks/use-hazard-voice-warnings';
import { useLiveLocation } from '../hooks/use-live-location';
import { useQuickVoiceReport } from '../hooks/use-quick-voice-report';
import { useVoiceHazardReportFlow } from '../hooks/use-voice-hazard-report-flow';
import { computeEta } from '../lib/eta';
import { arrivalStep } from '../lib/job-navigation';
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
import { useThemeColors, type ThemeColors } from '../theme/colors';

const VOICE_FLOW_LABEL: Record<string, string> = {
  idle: 'Report hazard',
  'capturing-report': 'Listening… tap to cancel',
  'report-no-speech': "Didn't catch that — tap to try again",
  parsing: 'Working out what you said…',
  'speaking-summary': 'Confirm out loud…',
  'capturing-confirmation': 'Listening for yes or no… tap to cancel',
  filing: 'Saving…',
  filed: 'Report hazard',
  queued: 'Report hazard',
  'draft-saved': 'Report hazard',
  error: 'Tap to try again',
};

const QUICK_REPORT_LABEL: Record<QuickReportKind, string> = {
  traffic: 'Traffic',
  parking: 'Mark parking',
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
      return 'Listening… tap to cancel';
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
  const location = useLiveLocation();
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
  const corridor = useMemo(() => routeLine?.map(([lon, lat]) => ({ lat, lon })) ?? [], [routeLine]);
  const nearbyHazards = useNearbyHazards(corridor, ON_ROUTE_HAZARD_RADIUS_M);
  const nearbyHazardsData = nearbyHazards.data;
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);
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
    <SafeAreaView style={styles.container}>
      <View style={styles.mapArea}>
        <RouteMap
          origin={plan.origin}
          destination={plan.destination}
          routeLine={routeLine}
          currentPosition={location.point}
          hazards={nearbyHazardsData?.map((h) => ({
            id: h.id,
            type: h.type,
            location: h.location,
          }))}
          onHazardPress={setSelectedHazardId}
        />

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

          {/* Traffic and Mark parking: one tap each, then entirely by voice — same big targets
              and no typing as the hazard mic (AGENTS.md: nothing on this screen needs typing or
              small taps while moving). Only one voice report runs at a time. */}
          <View style={styles.quickReportRow}>
            {(['traffic', 'parking'] as const).map((kind) => {
              const ownListening =
                quickListening && activeQuickReportKind(quickReport.state) === kind;
              const disabled =
                micBusy || micActive || quickBusy || (quickListening && !ownListening);
              return (
                <TouchableOpacity
                  key={kind}
                  style={[
                    styles.micButton,
                    styles.quickReportButton,
                    ownListening && styles.micButtonListening,
                    disabled && styles.buttonDisabled,
                  ]}
                  disabled={disabled}
                  onPress={() => (ownListening ? quickReport.cancel() : quickReport.start(kind))}
                  testID={`quick-report-${kind}`}
                >
                  <Text style={styles.micButtonText}>
                    {quickReportButtonLabel(kind, quickReport.state)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.micButton,
              micActive && styles.micButtonListening,
              (micBusy || quickInFlight) && styles.buttonDisabled,
            ]}
            disabled={micBusy || quickInFlight}
            onPress={micActive ? voiceFlow.reset : voiceFlow.start}
            testID="voice-report-button"
          >
            <Text style={styles.micButtonText}>{VOICE_FLOW_LABEL[voiceFlow.state.phase]}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.panel}>
        {location.status === 'denied' && (
          <Text style={styles.hint}>
            Location access is off, so the map won’t follow you — road signs and your own judgement
            still apply.
          </Text>
        )}

        {eta && (
          <Text style={styles.eta} testID="active-trip-eta">
            ETA {formatTime(eta)} · {remainingKm?.toFixed(1)} km left
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
                <Text style={styles.sectionItem}>
                  {HAZARD_TYPE_LABELS[hazard.type]}
                  {hazard.measurement ? ` · ${formatMeasurement(hazard.measurement)}` : ''}
                </Text>
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
          style={[styles.button, endTrip.isPending && styles.buttonDisabled]}
          disabled={endTrip.isPending}
          onPress={handleEndTrip}
          testID="end-trip-button"
        >
          {endTrip.isPending ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={styles.buttonText}>End trip</Text>
          )}
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
    panel: {
      padding: 16,
      gap: 12,
      backgroundColor: colors.background,
    },
    hint: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
    },
    eta: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.accentBlue,
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
    micButton: {
      minHeight: 56,
      paddingHorizontal: 24,
      backgroundColor: 'rgba(56, 189, 248, 0.55)',
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    quickReportRow: {
      flexDirection: 'row',
      gap: 8,
      alignSelf: 'stretch',
      justifyContent: 'center',
    },
    quickReportButton: {
      flex: 1,
      maxWidth: 200,
      paddingHorizontal: 12,
    },
    micButtonListening: {
      backgroundColor: 'rgba(248, 113, 113, 0.8)',
    },
    micButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0B1220',
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
      minHeight: 56,
      backgroundColor: colors.accent,
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
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
