import { Redirect, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { RouteMap } from '../components/route-map';
import { decodePolyline6 } from '../lib/polyline';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';

export default function RouteOverviewScreen() {
  const router = useRouter();
  const plan = useCurrentRoutePlanStore((s) => s.plan);
  const clearPlan = useCurrentRoutePlanStore((s) => s.clear);

  // decodePolyline6 is a pure function of plan.geometry — no need to redo it on every
  // unrelated re-render (e.g. a tap elsewhere on this screen).
  const routeLine = useMemo(() => (plan ? decodePolyline6(plan.geometry) : undefined), [plan]);

  // Reachable with no current plan only by navigating here directly (e.g. a stale deep link) —
  // there's nothing to show, so send the driver back to plan one rather than rendering a blank
  // map. Genuinely a wiring edge case, not a state a normal tap-through can reach.
  if (!plan || !routeLine) {
    return <Redirect href="/plan-route" />;
  }

  function handlePlanAnother(): void {
    clearPlan();
    router.replace('/plan-route');
  }

  return (
    <SafeAreaView style={styles.container}>
      <RouteMap origin={plan.origin} destination={plan.destination} routeLine={routeLine} />

      <View style={styles.panel}>
        <Text style={styles.distance}>
          {plan.distanceKm.toFixed(1)} km · {Math.round(plan.durationMin)} min
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Restrictions avoided</Text>
          {plan.avoidedRestrictions.length === 0 ? (
            <Text style={styles.sectionEmpty}>None on this route.</Text>
          ) : (
            plan.avoidedRestrictions.map((restriction, index) => (
              <Text key={index} style={styles.sectionItem}>
                {restriction.description}
              </Text>
            ))
          )}
        </View>

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

        <Text style={styles.footnote}>
          This is a planning aid — road signs and your own judgement always come first.
        </Text>

        {/* Disabled, not wired: active-trip tracking is M5.6's screen and M6's backend
            (docs/progress.md — no active_trips table or trip-start endpoint exists yet).
            Shown per the design doc's own screen table rather than omitted, but honestly
            disabled rather than pointing at a screen that doesn't exist. */}
        <TouchableOpacity
          style={[styles.button, styles.buttonDisabled]}
          disabled
          testID="start-trip-button"
        >
          <Text style={styles.buttonText}>Start trip</Text>
        </TouchableOpacity>
        <Text style={styles.footnote}>Active trip tracking is coming soon.</Text>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={handlePlanAnother}
          testID="plan-another-button"
        >
          <Text style={styles.linkText}>Plan a different route</Text>
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
  distance: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
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
  linkButton: {
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkText: {
    fontSize: 16,
    color: '#9CA3AF',
    textDecorationLine: 'underline',
  },
});
