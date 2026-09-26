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
import { formatMeasurement, HAZARD_TYPE_LABELS } from '../lib/hazard-labels';
import { decodePolyline6 } from '../lib/polyline';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';

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
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // decodePolyline6 is a pure function of plan.geometry — no need to redo it on every
  // unrelated re-render (e.g. a tap elsewhere on this screen).
  const routeLine = useMemo(() => (plan ? decodePolyline6(plan.geometry) : undefined), [plan]);
  const corridor = useMemo(() => routeLine?.map(([lon, lat]) => ({ lat, lon })) ?? [], [routeLine]);
  const nearbyHazards = useNearbyHazards(corridor, ON_ROUTE_HAZARD_RADIUS_M);
  const nearbyHazardsData = nearbyHazards.data;
  // `plan.hazardsOnRoute` is the authoritative "on this route" list (a real, ~30m-of-the-final-
  // route server query as of the plan/hazardsOnRoute-populate change) but it's bare ids, nothing
  // a driver can read. Cross-referencing against `nearbyHazards`' fuller objects (already fetched
  // for the map markers, a broader ~750m corridor check) gets a readable label without a second
  // request — an id that's since been dismissed/expired (so it's dropped out of the live query)
  // just doesn't render, which is the right call for something no longer actually there.
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
            <ActivityIndicator color={colors.textOnAccent} />
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

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    panel: {
      padding: 16,
      gap: 12,
      backgroundColor: colors.background,
    },
    distance: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
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
      color: colors.accentBlue,
    },
    etaChangeLink: {
      fontSize: 14,
      color: colors.textMuted,
      textDecorationLine: 'underline',
    },
    pickerWrap: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 8,
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
    footnote: {
      fontSize: 13,
      color: colors.textDim,
      textAlign: 'center',
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
    linkButton: {
      minHeight: 56,
      justifyContent: 'center',
      alignItems: 'center',
    },
    linkText: {
      fontSize: 16,
      color: colors.textMuted,
      textDecorationLine: 'underline',
    },
    error: {
      fontSize: 16,
      color: colors.danger,
      textAlign: 'center',
    },
  });
}
