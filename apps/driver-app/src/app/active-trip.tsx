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
import { routingErrorMessage } from '../lib/error-messages';
import { decodePolyline6 } from '../lib/polyline';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';

/**
 * The active-trip screen (design doc §8, M5.6): a map following the driver's live position, an
 * upcoming-hazards list, and a real "End trip" button. The mic button and reroute prompts the
 * design doc also lists for this screen stay disabled placeholders — M6 (reroute) and M7 (voice)
 * territory, per the M5 task breakdown's own note on this task.
 */
export default function ActiveTripScreen() {
  const router = useRouter();
  const trip = useCurrentActiveTripStore((s) => s.trip);
  const clearTrip = useCurrentActiveTripStore((s) => s.clear);
  const plan = useCurrentRoutePlanStore((s) => s.plan);
  const clearPlan = useCurrentRoutePlanStore((s) => s.clear);
  const location = useLiveLocation();
  const endTrip = useEndTrip();

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

        {/* Disabled, not wired: hands-free voice reporting is M7 (docs/progress.md, M5.6). Shown
            per the design doc's own screen table rather than omitted, but honestly disabled
            rather than pointing at a feature that doesn't exist. */}
        <TouchableOpacity
          style={[styles.micButton, styles.buttonDisabled]}
          disabled
          testID="voice-report-button"
        >
          <Text style={styles.micButtonText}>Report hazard</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>Hands-free voice reporting is coming soon.</Text>

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
