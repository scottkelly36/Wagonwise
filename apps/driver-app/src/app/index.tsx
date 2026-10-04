import { Redirect } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useResumeActiveTrip } from '../api/use-active-trip';
import { useAuthStore } from '../state/auth-store';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';

/**
 * A gate, not a screen: while the stored session is being restored (or exchanged for a fresh
 * access token — auth-store's restore() does both at once), show a spinner; once settled, hand
 * off to sign-in or the signed-in area. Also where a relaunch resumes an in-progress trip (design
 * decision, 2026-09-24) — the local trip/plan stores are ephemeral (M5.6) and don't survive one,
 * so without this a driver who exits mid-trip without tapping "End trip" has no way back to it,
 * and `startTrip` rejects a new one with `TripAlreadyActive`. Nothing here is itself navigable
 * content.
 */
export default function IndexScreen() {
  const state = useAuthStore((s) => s.state);
  const setTrip = useCurrentActiveTripStore((s) => s.setTrip);
  const setPlan = useCurrentRoutePlanStore((s) => s.setPlan);
  const resumeQuery = useResumeActiveTrip(
    state.status === 'signedIn' ? state.accessToken : undefined,
  );
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    if (resumeQuery.data) {
      setTrip(resumeQuery.data.trip);
      setPlan(resumeQuery.data.plan);
    }
  }, [resumeQuery.data, setTrip, setPlan]);

  if (state.status === 'restoring') {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.text} />
      </SafeAreaView>
    );
  }

  if (state.status !== 'signedIn') {
    return <Redirect href="/sign-in" />;
  }

  // Design doc §9's privacy notice/consent screen (M8) — before anything else, including the
  // resume-trip check below, since neither is meaningful until a driver has actually agreed to
  // how their data is used.
  if (state.driver.consentedAt === undefined) {
    return <Redirect href="/consent" />;
  }

  // Waiting on the resume check before committing to a destination — home vs. straight back
  // into the trip. `resumeQuery.data` stays undefined on a failed check (offline, `retry: 1`
  // exhausted), which falls through to `/home` below rather than blocking sign-in on it.
  if (resumeQuery.isPending) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.text} />
      </SafeAreaView>
    );
  }

  return <Redirect href={resumeQuery.data ? '/active-trip' : '/home'} />;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
}
