import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useEndTrip } from '../api/use-active-trip';
import { RouteMap } from '../components/route-map';
import { useLiveLocation } from '../hooks/use-live-location';
import { useVoiceReportCapture } from '../hooks/use-voice-report-capture';
import { routingErrorMessage } from '../lib/error-messages';
import { decodePolyline6 } from '../lib/polyline';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';

const VOICE_CAPTURE_LABEL: Record<string, string> = {
  idle: 'Report hazard',
  starting: 'Starting…',
  listening: 'Listening… tap to cancel',
  transcribed: 'Report hazard',
  'no-speech': "Didn't catch that — tap to try again",
  error: "Couldn't hear that — tap to try again",
  'permission-denied': 'Microphone access is off — tap to try again',
};

/**
 * The active-trip screen (design doc §8, M5.6): a map following the driver's live position, an
 * upcoming-hazards list, and a real "End trip" button. Reroute prompts arrive as M6.6's own
 * screen (`app/reroute/[id].tsx`), reached via notification, not from here. The mic button is now
 * real capture (M7.2) — parsing what was said and filing the report are still M7.3's job, so a
 * transcript is shown but nothing is submitted yet.
 */
export default function ActiveTripScreen() {
  const router = useRouter();
  const trip = useCurrentActiveTripStore((s) => s.trip);
  const clearTrip = useCurrentActiveTripStore((s) => s.clear);
  const plan = useCurrentRoutePlanStore((s) => s.plan);
  const clearPlan = useCurrentRoutePlanStore((s) => s.clear);
  const location = useLiveLocation();
  const endTrip = useEndTrip();
  const voiceCapture = useVoiceReportCapture();

  // decodePolyline6 is a pure function of plan.geometry — no need to redo it on every
  // unrelated re-render (e.g. a location update).
  const routeLine = useMemo(() => (plan ? decodePolyline6(plan.geometry) : undefined), [plan]);

  // Reachable with no current trip/plan only by navigating here directly, or after an app
  // relaunch mid-trip — the trip store is ephemeral (docs/progress.md, M5.6 deviations) and
  // doesn't survive one. Nothing to show, so send the driver back to plan a route rather than
  // rendering a blank screen.
  if (!trip || !plan) {
    return <Redirect href="/plan-route" />;
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
      <RouteMap
        origin={plan.origin}
        destination={plan.destination}
        routeLine={routeLine}
        currentPosition={location.point}
      />

      <View style={styles.panel}>
        {location.status === 'denied' && (
          <Text style={styles.hint}>
            Location access is off, so the map won’t follow you — road signs and your own judgement
            still apply.
          </Text>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hazards on this route</Text>
          {plan.hazardsOnRoute.length === 0 ? (
            <Text style={styles.sectionEmpty}>None reported.</Text>
          ) : (
            plan.hazardsOnRoute.map((hazardId) => (
              <Text key={hazardId} style={styles.sectionItem}>
                {hazardId}
              </Text>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.micButton,
            (voiceCapture.state.status === 'starting' ||
              voiceCapture.state.status === 'listening') &&
              styles.micButtonListening,
          ]}
          onPress={
            voiceCapture.state.status === 'starting' || voiceCapture.state.status === 'listening'
              ? voiceCapture.cancel
              : voiceCapture.start
          }
          testID="voice-report-button"
        >
          <Text style={styles.micButtonText}>{VOICE_CAPTURE_LABEL[voiceCapture.state.status]}</Text>
        </TouchableOpacity>

        {voiceCapture.state.status === 'transcribed' && (
          <Text style={styles.footnote} testID="voice-report-transcript">
            Heard: “{voiceCapture.state.transcript}” — filing this report is coming soon.
          </Text>
        )}
        {voiceCapture.state.status === 'error' && voiceCapture.state.errorMessage !== undefined && (
          <Text style={styles.footnote}>{voiceCapture.state.errorMessage}</Text>
        )}

        {endTrip.isError && <Text style={styles.error}>{routingErrorMessage(endTrip.error)}</Text>}

        <TouchableOpacity
          style={[styles.button, endTrip.isPending && styles.buttonDisabled]}
          disabled={endTrip.isPending}
          onPress={handleEndTrip}
          testID="end-trip-button"
        >
          {endTrip.isPending ? (
            <ActivityIndicator color="#0B1220" />
          ) : (
            <Text style={styles.buttonText}>End trip</Text>
          )}
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
  panel: {
    padding: 16,
    gap: 12,
    backgroundColor: '#0B1220',
  },
  hint: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  sectionEmpty: {
    fontSize: 16,
    color: '#E5E7EB',
  },
  sectionItem: {
    fontSize: 16,
    color: '#E5E7EB',
  },
  footnote: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  micButton: {
    minHeight: 88,
    backgroundColor: '#38BDF8',
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonListening: {
    backgroundColor: '#F87171',
  },
  micButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0B1220',
  },
  button: {
    minHeight: 56,
    backgroundColor: '#F5A623',
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
    color: '#0B1220',
  },
  error: {
    fontSize: 16,
    color: '#F87171',
    textAlign: 'center',
  },
});
