import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRoutePlan } from '../../api/use-route-plan';
import { RouteMap } from '../../components/route-map';
import { routingErrorMessage } from '../../lib/error-messages';
import { decodePolyline6 } from '../../lib/polyline';
import { useCurrentActiveTripStore } from '../../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../../state/current-route-plan-store';
import { Icon } from '../../components/ui/icon';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle, radius } from '../../theme/tokens';

/**
 * Design doc §6: "Opening the notification shows old vs new route; driver accepts or keeps the
 * original. Never switch silently." (AGENTS.md's own safety rule, restated). `:id` is the
 * `newRoutePlanId` a reroute push carries (M6.4's `detect-reroute.ts`) — the *current* route is
 * whatever's already in `current-route-plan-store`, never re-fetched.
 *
 * Reachable only via `useRerouteNotifications` (M6.6), which only ever navigates here while
 * signed in with a real `newRoutePlanId`. A missing current plan (app relaunched — both trip and
 * plan stores are ephemeral, M5.6/M5.5's own accepted gap) means there's nothing to compare
 * against or reroute from, so this redirects the same way `active-trip.tsx` and
 * `route-overview.tsx` already do for the equivalent case, rather than guessing.
 */
export default function RerouteScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentPlan = useCurrentRoutePlanStore((s) => s.plan);
  const setPlan = useCurrentRoutePlanStore((s) => s.setPlan);
  const trip = useCurrentActiveTripStore((s) => s.trip);
  const { data: newPlan, isLoading, isError, error } = useRoutePlan(id);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const currentLine = useMemo(
    () => (currentPlan ? decodePolyline6(currentPlan.geometry) : undefined),
    [currentPlan],
  );
  const newLine = useMemo(
    () => (newPlan ? decodePolyline6(newPlan.geometry) : undefined),
    [newPlan],
  );

  if (!currentPlan) {
    return <Redirect href="/plan-route" />;
  }

  // Once accepted or dismissed, go back to wherever the driver's trip actually is — mid-trip
  // (active-trip) or still just planned (route-overview), matching how each of those screens
  // itself got here.
  const backTo = trip ? '/active-trip' : '/route-overview';

  function handleUseNewRoute(): void {
    if (!newPlan) return;
    setPlan(newPlan);
    router.replace(backTo);
  }

  function handleKeepCurrent(): void {
    router.replace(backTo);
  }

  return (
    <View style={styles.container}>
      <RouteMap
        origin={currentPlan.origin}
        destination={currentPlan.destination}
        routeLine={currentLine}
        alternateRouteLine={newLine}
      />

      <ActivityIndicator
        style={[styles.loading, !isLoading && styles.hidden]}
        size="large"
        color={colors.text}
      />

      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <View style={styles.titleRow}>
          <Icon name="directions-fork" size={30} color={colors.accent} />
          <Text style={styles.title}>A new route avoids a hazard ahead</Text>
        </View>

        {isError && <Text style={styles.error}>{routingErrorMessage(error)}</Text>}

        {newPlan && (
          <Text style={styles.comparison}>
            Current: {currentPlan.distanceKm.toFixed(1)} km · {Math.round(currentPlan.durationMin)}{' '}
            min{'\n'}
            New: {newPlan.distanceKm.toFixed(1)} km · {Math.round(newPlan.durationMin)} min
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, styles.acceptButton, !newPlan && styles.buttonDisabled]}
          disabled={!newPlan}
          onPress={handleUseNewRoute}
          testID="use-new-route-button"
        >
          <Text style={styles.buttonText}>Use new route</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.keepButton]}
          onPress={handleKeepCurrent}
          testID="keep-current-route-button"
        >
          <Text style={[styles.buttonText, styles.keepButtonText]}>Keep current route</Text>
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
    loading: {
      position: 'absolute',
      top: '40%',
      left: 0,
      right: 0,
    },
    hidden: {
      display: 'none',
    },
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
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    title: {
      flex: 1,
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
    },
    comparison: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    button: {
      minHeight: 64,
      borderRadius: 32,
      justifyContent: 'center',
      alignItems: 'center',
    },
    acceptButton: {
      backgroundColor: colors.accentGreen,
    },
    keepButton: {
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.textDim,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    keepButtonText: {
      color: colors.text,
    },
    error: {
      fontSize: 16,
      color: colors.danger,
      textAlign: 'center',
    },
  });
}
