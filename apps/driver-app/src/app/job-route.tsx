import type { PlanRouteRequest, RouteOptionDto } from '@wagonwise/contracts/routing';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as jobsApi from '../api/jobs';
import { useCurrentJob } from '../api/use-jobs';
import { useCreateRoutePlan, usePreviewRouteOptions } from '../api/use-route-plans';
import { OPTION_COLOURS, RouteOptionsList } from '../components/route-options-list';
import { RouteMap, type MapPoint, type RouteOptionLine } from '../components/route-map';
import { RoundButton } from '../components/ui/round-button';
import { useAccessToken } from '../hooks/use-access-token';
import { fetchCurrentLocation } from '../hooks/use-current-location';
import { jobNavigationErrorMessage, LocationUnavailableError } from '../lib/error-messages';
import { navigationTarget } from '../lib/job-navigation';
import { decodePolyline6 } from '../lib/polyline';
import { strategyForOption } from '../lib/route-option-text';
import { WEIGHT_LIMIT_CONFIRM_BODY, WEIGHT_LIMIT_CONFIRM_TITLE } from '../lib/weight-limit-warning';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { useLoadStore } from '../state/load-store';
import { useMeasureUnitsStore } from '../state/measure-units-store';
import { useTripTollsStore } from '../state/trip-tolls-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';

interface Prepared {
  readonly profileId: PlanRouteRequest['profileId'];
  readonly origin: MapPoint;
  readonly destination: MapPoint;
  readonly options: readonly RouteOptionDto[];
  readonly loaded: boolean;
}

/**
 * Choosing the route for an assigned job: the same cards a personal trip gets (fastest, shortest, fewer hills, toll free, with tolls, zone charges and
 * what each costs), then the route overview and the trip. Reached from the job's Start or Set off, which has already moved the job on. The vehicle is the
 * one the dispatcher assigned and the destination is the job's next stop, so neither can be changed here: a wrong height is what puts a lorry under a low
 * bridge. The route is made from where the driver is now.
 */
export default function JobRouteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const accessToken = useAccessToken();
  const job = useCurrentJob();
  const previewRouteOptions = usePreviewRouteOptions();
  const createRoutePlan = useCreateRoutePlan();
  const setCurrentRoutePlan = useCurrentRoutePlanStore((s) => s.setPlan);
  const distanceUnit = useMeasureUnitsStore((s) => s.distance);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [prepared, setPrepared] = useState<Prepared | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const asked = useRef(false);

  const target = job.data ? navigationTarget(job.data) : undefined;
  const jobId = job.data?.id;
  const targetPoint = target?.stop.location;

  // Looked for once when the screen opens, with where the driver is now.
  useEffect(() => {
    if (asked.current || jobId === undefined || targetPoint === undefined) return;
    asked.current = true;
    void (async () => {
      try {
        const here = await fetchCurrentLocation();
        if (!here.ok) throw new LocationUnavailableError();
        const { profileId } = await jobsApi.getNavigationProfile(accessToken, jobId);
        const loaded = useLoadStore.getState().loaded;
        const options = await previewRouteOptions.mutateAsync({
          profileId,
          origin: here.point,
          destination: targetPoint,
          ...(loaded ? { loaded: true } : {}),
          tolls: true,
          dailyZones: true,
          costs: true,
        });
        setPrepared({ profileId, origin: here.point, destination: targetPoint, options, loaded });
      } catch (caught) {
        setError(caught);
      }
    })();
    // `previewRouteOptions` is a new object each render; the guard above makes this run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, jobId, targetPoint]);

  const optionLines = useMemo<RouteOptionLine[] | undefined>(
    () =>
      prepared?.options.map((option, index) => ({
        id: String(index),
        line: decodePolyline6(option.geometry),
        color: OPTION_COLOURS[index % OPTION_COLOURS.length],
      })),
    [prepared],
  );

  if (job.isPending) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }
  // A stale link, or the job moved on (delivered elsewhere): nothing to navigate to.
  if (!job.data || target === undefined) {
    return <Redirect href="/home" />;
  }

  function plan(option: RouteOptionDto, acceptWeightLimit: boolean): void {
    if (prepared === undefined) return;
    const strategy = strategyForOption(option);
    createRoutePlan.mutate(
      {
        profileId: prepared.profileId,
        origin: prepared.origin,
        destination: prepared.destination,
        strategy,
        ...(acceptWeightLimit ? { acceptWeightLimit: true } : {}),
      },
      {
        onSuccess: (made) => {
          // Chosen for having no toll: the re-plan from here and the faster-route check keep it that way.
          if (strategy === 'toll-free') useTripTollsStore.getState().markAvoiding(made.id);
          setCurrentRoutePlan(made);
          router.replace('/route-overview');
        },
      },
    );
  }

  function handleChoose(option: RouteOptionDto): void {
    if (option.breaksWeightLimit === true) {
      // The driver has to choose this on purpose: it is only offered when no route keeps to the vehicle's weight limits.
      Alert.alert(WEIGHT_LIMIT_CONFIRM_TITLE, WEIGHT_LIMIT_CONFIRM_BODY, [
        { text: 'Go back', style: 'cancel' },
        { text: 'Go anyway', onPress: () => plan(option, true) },
      ]);
      return;
    }
    plan(option, false);
  }

  const failure = error ?? (createRoutePlan.isError ? createRoutePlan.error : undefined);

  return (
    <View style={styles.container} testID="job-route-screen">
      <RouteMap
        origin={prepared?.origin}
        destination={prepared?.destination ?? targetPoint}
        routeOptionLines={optionLines}
      />

      <View style={[styles.backOverlay, { top: insets.top + 8 }]} pointerEvents="box-none">
        <RoundButton
          icon="chevron-left"
          label="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/job'))}
          testID="back-button"
        />
      </View>

      <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <Text style={styles.heading} testID="job-route-heading">
          Choose the route to the {target.kind === 'pickup' ? 'pickup' : 'delivery'}
        </Text>
        <Text style={styles.note}>
          Your company’s vehicle and the stop are fixed. The route is made from where you are now.
        </Text>
        {failure !== undefined ? (
          <>
            <Text style={styles.error} testID="job-route-error">
              {jobNavigationErrorMessage(failure)}
            </Text>
            <TouchableOpacity
              style={styles.retry}
              onPress={() => router.replace('/job')}
              accessibilityRole="button"
              testID="job-route-back-to-job"
            >
              <Text style={styles.retryText}>Back to the job</Text>
            </TouchableOpacity>
          </>
        ) : prepared === undefined ? (
          <ActivityIndicator color={colors.text} testID="job-route-loading" />
        ) : (
          <RouteOptionsList
            options={prepared.options}
            comparedLoaded={prepared.loaded}
            distanceUnit={distanceUnit}
            busy={createRoutePlan.isPending}
            onChoose={handleChoose}
          />
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    backOverlay: { position: 'absolute', left: 16 },
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
    heading: { fontSize: 20, fontWeight: '800', color: colors.text },
    note: { fontSize: 14, color: colors.textMuted },
    error: { fontSize: 16, color: colors.danger },
    retry: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
    retryText: { fontSize: 16, fontWeight: '700', color: colors.accent },
  });
}
