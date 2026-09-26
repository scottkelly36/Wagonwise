import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useStartTrip } from '../api/use-active-trip';
import { useNearbyHazards } from '../api/use-hazards';
import { HazardDetailDrawer } from '../components/hazard-detail-drawer';
import { RouteMap } from '../components/route-map';
import { computeEta } from '../lib/eta';
import { routingErrorMessage } from '../lib/error-messages';
import { formatTime } from '../lib/format-date';
import { decodePolyline6 } from '../lib/polyline';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';

// "On your route" (design decision, 2026-09-24), same radius and reasoning as active-trip.tsx's
// own on-route hazard query — wider than a routing-avoidance check (30m, design doc §5), since
// this is just an on-map warning icon, not a decision to reroute around.
const ON_ROUTE_HAZARD_RADIUS_M = 750;

export default function RouteOverviewScreen() {
  const router = useRouter();
  const plan = useCurrentRoutePlanStore((s) => s.plan);
  const clearPlan = useCurrentRoutePlanStore((s) => s.clear);
  const setCurrentTrip = useCurrentActiveTripStore((s) => s.setTrip);
  const startTrip = useStartTrip();

  // undefined means "leaving now" — recomputed against the current time on every render,
  // rather than frozen at mount, so the ETA stays right if a driver lingers on this screen.
  // A driver who picks a specific time gets that instead, until they reset back to "now".
  const [leaveAt, setLeaveAt] = useState<Date | undefined>(undefined);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);

  // decodePolyline6 is a pure function of plan.geometry — no need to redo it on every
  // unrelated re-render (e.g. a tap elsewhere on this screen).
  const routeLine = useMemo(() => (plan ? decodePolyline6(plan.geometry) : undefined), [plan]);
  const corridor = useMemo(() => routeLine?.map(([lon, lat]) => ({ lat, lon })) ?? [], [routeLine]);
  const nearbyHazards = useNearbyHazards(corridor, ON_ROUTE_HAZARD_RADIUS_M);

  const eta = plan ? computeEta(leaveAt ?? new Date(), plan.durationMin) : undefined;

  function handleTimeChange(event: DateTimePickerEvent, selected?: Date): void {
    // Android's picker is a self-dismissing dialog; iOS's spinner stays open until the
    // driver taps "Done" below, since it fires onChange continuously while scrolling.
    if (Platform.OS === 'android') {
      setShowPicker(false);
    }
    if (event.type === 'set' && selected) {
      setLeaveAt(selected);
    }
  }

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

  function handleStartTrip(): void {
    if (!plan || startTrip.isPending) return;
    startTrip.mutate(plan.id, {
      onSuccess: (trip) => {
        setCurrentTrip(trip);
        router.replace('/active-trip');
      },
    });
  }

  return (
    <SafeAreaView style={styles.container}>
      <RouteMap
        origin={plan.origin}
        destination={plan.destination}
        routeLine={routeLine}
        hazards={nearbyHazards.data?.map((h) => ({
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

      <View style={styles.panel}>
        <Text style={styles.distance}>
          {plan.distanceKm.toFixed(1)} km · {Math.round(plan.durationMin)} min
        </Text>

        <View style={styles.etaRow}>
          <Text style={styles.eta}>ETA {eta ? formatTime(eta) : '—'}</Text>
          <TouchableOpacity onPress={() => setShowPicker(true)} testID="change-departure-button">
            <Text style={styles.etaChangeLink}>
              {leaveAt ? `Leaving ${formatTime(leaveAt)} · change` : 'Leaving now · change'}
            </Text>
          </TouchableOpacity>
          {leaveAt && (
            <TouchableOpacity onPress={() => setLeaveAt(undefined)} testID="leave-now-button">
              <Text style={styles.etaChangeLink}>Reset to now</Text>
            </TouchableOpacity>
          )}
        </View>

        {showPicker && (
          <View style={styles.pickerWrap}>
            <DateTimePicker
              value={leaveAt ?? new Date()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={handleTimeChange}
              testID="departure-time-picker"
            />
            {Platform.OS === 'ios' && (
              <TouchableOpacity onPress={() => setShowPicker(false)} testID="departure-time-done">
                <Text style={styles.etaChangeLink}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

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

        {startTrip.isError && (
          <Text style={styles.error}>{routingErrorMessage(startTrip.error)}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, startTrip.isPending && styles.buttonDisabled]}
          disabled={startTrip.isPending}
          onPress={handleStartTrip}
          testID="start-trip-button"
        >
          {startTrip.isPending ? (
            <ActivityIndicator color="#0B1220" />
          ) : (
            <Text style={styles.buttonText}>Start trip</Text>
          )}
        </TouchableOpacity>

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
  etaRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  eta: {
    fontSize: 16,
    fontWeight: '600',
    color: '#38BDF8',
  },
  etaChangeLink: {
    fontSize: 14,
    color: '#9CA3AF',
    textDecorationLine: 'underline',
  },
  pickerWrap: {
    alignItems: 'center',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    padding: 8,
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
  error: {
    fontSize: 16,
    color: '#F87171',
    textAlign: 'center',
  },
});
