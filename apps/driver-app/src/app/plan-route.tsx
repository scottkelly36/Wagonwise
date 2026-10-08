import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactElement } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PlanRouteRequest, RouteOptionDto } from '@wagonwise/contracts/routing';

import { useCreateVehicleProfile, useVehicleProfiles } from '../api/use-vehicle-profiles';
import { useNearbyHazards } from '../api/use-hazards';
import { useCreateRoutePlan, usePreviewRouteOptions } from '../api/use-route-plans';
import { AddressSearchField } from '../components/address-search-field';
import { HazardDetailDrawer } from '../components/hazard-detail-drawer';
import { RouteMap, type MapPoint, type RouteOptionLine } from '../components/route-map';
import { decodePolyline6 } from '../lib/polyline';
import { config } from '../config';
import { useCurrentLocation } from '../hooks/use-current-location';
import type { GeocodingResult } from '../lib/geocoding';
import { formatDateTime } from '../lib/format-date';
import { routingErrorMessage } from '../lib/error-messages';
import {
  mapTapTarget,
  targetAfterTap,
  type FromMode,
  type PointEnd,
  type ToMode,
} from '../lib/route-points';
import {
  EMPTY_VEHICLE_PROFILE_FORM,
  parseVehicleProfileForm,
  type VehicleProfileFormValues,
} from '../lib/vehicle-profile-form';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { Icon } from '../components/ui/icon';
import { PointPicker } from '../components/point-picker';
import { RoundButton } from '../components/ui/round-button';
import { SegmentedControl } from '../components/ui/segmented-control';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';

type VehicleMode = 'profile' | 'manual';
// How each end of the route is set. From starts on the driver's own position, so they only change it to
// start somewhere else; To has no default.

const VEHICLE_MODE_OPTIONS = [
  { key: 'profile', label: 'My vehicles' },
  { key: 'manual', label: 'Enter details' },
] as const;
const FROM_OPTIONS = [
  { key: 'search', label: 'Search' },
  { key: 'map', label: 'Map' },
] as const;
const TO_OPTIONS = [
  { key: 'search', label: 'Search' },
  { key: 'map', label: 'Map' },
] as const;

/** No name field shown here — a manually-entered vehicle is named automatically (design decision,
 *  2026-09-24: "silently creating a profile" so planning without picking a saved vehicle first
 *  still leaves the driver with one for next time, rather than a one-off that goes nowhere). */
const DIMENSION_FIELDS: {
  readonly key: keyof Omit<VehicleProfileFormValues, 'name'>;
  readonly label: string;
  readonly placeholder: string;
}[] = [
  { key: 'heightM', label: 'Height (metres)', placeholder: '4.2' },
  { key: 'widthM', label: 'Width (metres)', placeholder: '2.6' },
  { key: 'lengthM', label: 'Length (metres)', placeholder: '16.5' },
  { key: 'grossWeightT', label: 'Gross weight (tonnes)', placeholder: '32' },
  { key: 'axleWeightT', label: 'Axle weight (tonnes, optional)', placeholder: '10' },
];

// Same radius as home.tsx's "near me" query — a straight line between origin and destination
// isn't the real route yet (that only exists once planning succeeds), but it's a reasonable
// stand-in for "roughly this direction of travel" until then (design decision, 2026-09-24: fixes
// hazards being visible on the home map but not here).
const NEARBY_RADIUS_M = 5_000;

// One colour per route option, drawn on the map and repeated on its card so the two can be matched.
// Indigo, magenta, amber: in the app's blue-violet family for the first, and none of them a pale blue,
// which reads as a river on the base map (design decision, 2026-09-24).
const OPTION_COLOURS = ['#5B4BDB', '#D6336C', '#E8890C'] as const;

export default function PlanRouteScreen() {
  const router = useRouter();
  const location = useCurrentLocation();
  const { data: profiles, isLoading: profilesLoading } = useVehicleProfiles();
  const createVehicleProfile = useCreateVehicleProfile();
  const createRoutePlan = useCreateRoutePlan();
  const previewRouteOptions = usePreviewRouteOptions();
  const setCurrentRoutePlan = useCurrentRoutePlanStore((s) => s.setPlan);

  // M9: a driver compares options before committing. `undefined` means "haven't compared yet" —
  // the panel still shows the ordinary "Plan route" button in that state, one tap away from
  // exactly today's behaviour if there's only one real option.
  const [routeOptions, setRouteOptions] = useState<readonly RouteOptionDto[] | undefined>(
    undefined,
  );
  const [comparedProfileId, setComparedProfileId] = useState<
    PlanRouteRequest['profileId'] | undefined
  >(undefined);

  const optionLines = useMemo<RouteOptionLine[] | undefined>(
    () =>
      routeOptions?.map((option, index) => ({
        id: String(index),
        line: decodePolyline6(option.geometry),
        color: OPTION_COLOURS[index % OPTION_COLOURS.length],
      })),
    [routeOptions],
  );

  const [vehicleMode, setVehicleMode] = useState<VehicleMode>('profile');
  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [dimensionValues, setDimensionValues] = useState(EMPTY_VEHICLE_PROFILE_FORM);
  const [manualError, setManualError] = useState<string | undefined>(undefined);
  const [origin, setOrigin] = useState<MapPoint | undefined>(undefined);
  const [destination, setDestination] = useState<MapPoint | undefined>(undefined);
  const [fromMode, setFromMode] = useState<FromMode>('here');
  const [toMode, setToMode] = useState<ToMode>('search');
  // Which end a map tap sets, when both are on Map.
  const [tapTarget, setTapTarget] = useState<PointEnd>('destination');
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // From is the driver's own position (design doc §8) until they choose to start somewhere else, and
  // then it is only what they set, never quietly their position: a GPS fix landing late must not
  // override a start they searched for or tapped.
  const effectiveOrigin = fromMode === 'here' ? location.point : origin;

  const corridor = [effectiveOrigin, destination].filter((p): p is MapPoint => p !== undefined);
  const nearbyHazards = useNearbyHazards(corridor, NEARBY_RADIUS_M);

  // With exactly one saved vehicle there is nothing to choose, so it is already selected.
  const selectedProfile =
    profiles?.find((p) => p.id === profileId) ?? (profiles?.length === 1 ? profiles[0] : undefined);
  const noVehiclesYet = !profilesLoading && profiles !== undefined && profiles.length === 0;
  const pending =
    createVehicleProfile.isPending || createRoutePlan.isPending || previewRouteOptions.isPending;
  const canPlan =
    effectiveOrigin !== undefined &&
    destination !== undefined &&
    !pending &&
    (vehicleMode === 'manual' || selectedProfile !== undefined);

  // The one thing still needed before a route can be planned, in the order a first-time driver does
  // them, so the button is never just greyed out with no word on why.
  const nextStepHint: string | undefined =
    vehicleMode === 'profile' && noVehiclesYet
      ? 'Step 1: add your vehicle above.'
      : vehicleMode === 'profile' && selectedProfile === undefined
        ? 'Step 1: choose your vehicle above.'
        : effectiveOrigin === undefined
          ? fromMode === 'here'
            ? 'Waiting for your location. Or tap Change on From.'
            : fromMode === 'search'
              ? 'Search for your start point.'
              : 'Tap the map to set your start.'
          : destination === undefined
            ? toMode === 'search'
              ? 'Now search for where you are going.'
              : 'Now tap the map where you are going.'
            : undefined;

  function setDimensionField(field: keyof Omit<VehicleProfileFormValues, 'name'>) {
    return (text: string) => {
      setManualError(undefined);
      setRouteOptions(undefined);
      setDimensionValues((current) => ({ ...current, [field]: text }));
    };
  }

  /** The line under an end that is set on the map. With both ends on Map it also says which one the next
   *  tap moves (highlighted), and tapping the other end's line aims taps at it. */
  function mapHelp(end: PointEnd): ReactElement {
    const both = fromMode === 'map' && toMode === 'map';
    const isNext = both && tapTarget === end;
    const point = end === 'origin' ? origin : destination;
    const name = end === 'origin' ? 'start' : 'destination';
    const text =
      point === undefined
        ? isNext || !both
          ? end === 'origin'
            ? 'Tap the map to set your start.'
            : 'Tap the map where you are going.'
          : `Tap here to set your ${name}.`
        : `${end === 'origin' ? 'Start' : 'Destination'} set.${
            both
              ? isNext
                ? ' Next tap moves it.'
                : ' Tap here to move it.'
              : ' Tap the map to move it.'
          }`;
    return (
      <TouchableOpacity
        disabled={!both || isNext}
        onPress={() => setTapTarget(end)}
        accessibilityRole="button"
        style={isNext ? styles.pointHelpNext : undefined}
        testID={`${end}-map-help`}
      >
        <Text style={isNext ? styles.pointHelpNextText : styles.pointHelp}>{text}</Text>
      </TouchableOpacity>
    );
  }

  function handleMapPress(point: MapPoint): void {
    setRouteOptions(undefined);
    // A tap sets the end that is on Map. With both on Map it sets the one last chosen; with neither, it
    // sets the destination and puts To on Map.
    const target = mapTapTarget(fromMode, toMode, tapTarget);
    if (target === 'origin') setOrigin(point);
    else {
      setDestination(point);
      setToMode('map');
    }
    setTapTarget(
      targetAfterTap(
        target,
        fromMode,
        // A tap with To on Search puts To on Map, so it counts as Map here.
        target === 'destination' ? 'map' : toMode,
        target === 'origin' ? destination !== undefined : origin !== undefined,
        target,
      ),
    );
  }

  function handleFromModeChange(mode: FromMode): void {
    if (mode === fromMode) {
      // Pressing Map again aims the next tap at the start without clearing it.
      if (mode === 'map') setTapTarget('origin');
      return;
    }
    setRouteOptions(undefined);
    setFromMode(mode);
    setOrigin(undefined);
    if (mode === 'map') setTapTarget('origin');
  }

  function handleToModeChange(mode: ToMode): void {
    if (mode === toMode) {
      if (mode === 'map') setTapTarget('destination');
      return;
    }
    setRouteOptions(undefined);
    setToMode(mode);
    setDestination(undefined);
    if (mode === 'map') setTapTarget('destination');
  }

  function handleOriginSearchSelect(result: GeocodingResult): void {
    setRouteOptions(undefined);
    setOrigin(result.point);
  }

  function handleDestinationSearchSelect(result: GeocodingResult): void {
    setRouteOptions(undefined);
    setDestination(result.point);
  }

  function handleSelectProfile(id: string): void {
    setRouteOptions(undefined);
    setProfileId(id);
  }

  function handleSelectVehicleMode(mode: VehicleMode): void {
    setRouteOptions(undefined);
    setVehicleMode(mode);
  }

  /** The strategy `planRoute` needs to reproduce whichever option the driver picked — a route
   *  that's both fastest and shortest (identical geometry) is requested the cheap way, same as
   *  today's behaviour before M9 existed. */
  function strategyFor(option: RouteOptionDto): PlanRouteRequest['strategy'] {
    return option.labels.includes('fastest') ? 'fastest' : 'shortest';
  }

  function planWith(
    profileId: PlanRouteRequest['profileId'],
    origin: MapPoint,
    destination: MapPoint,
    strategy?: PlanRouteRequest['strategy'],
  ): void {
    createRoutePlan.mutate(
      { profileId, origin, destination, strategy },
      {
        onSuccess: (plan) => {
          setCurrentRoutePlan(plan);
          router.push('/route-overview');
        },
      },
    );
  }

  /** Manual entry creates the profile first — silently, no separate save step — same as before
   *  M9. Returns the id to compare/plan with, whichever path got there. */
  function resolveProfileId(onProfileId: (id: PlanRouteRequest['profileId']) => void): void {
    if (vehicleMode === 'profile') {
      if (selectedProfile === undefined) return;
      onProfileId(selectedProfile.id);
      return;
    }
    const result = parseVehicleProfileForm({
      ...dimensionValues,
      name: `Vehicle ${formatDateTime(new Date().toISOString())}`,
    });
    if (!result.ok) {
      setManualError(result.message);
      return;
    }
    createVehicleProfile.mutate(
      { name: result.value.name, dimensions: result.value.dimensions },
      { onSuccess: (profile) => onProfileId(profile.id) },
    );
  }

  function handleCompareRoutes(): void {
    if (!canPlan || effectiveOrigin === undefined || destination === undefined) return;
    setRouteOptions(undefined);
    resolveProfileId((resolvedProfileId) => {
      setComparedProfileId(resolvedProfileId);
      previewRouteOptions.mutate(
        { profileId: resolvedProfileId, origin: effectiveOrigin, destination },
        { onSuccess: setRouteOptions },
      );
    });
  }

  function handleConfirmOption(option: RouteOptionDto): void {
    if (
      comparedProfileId === undefined ||
      effectiveOrigin === undefined ||
      destination === undefined
    ) {
      return;
    }
    planWith(comparedProfileId, effectiveOrigin, destination, strategyFor(option));
  }

  const pendingCompare = createVehicleProfile.isPending || previewRouteOptions.isPending;
  const displayedError =
    manualError ??
    (createVehicleProfile.isError
      ? routingErrorMessage(createVehicleProfile.error)
      : previewRouteOptions.isError
        ? routingErrorMessage(previewRouteOptions.error)
        : createRoutePlan.isError
          ? routingErrorMessage(createRoutePlan.error)
          : undefined);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        // The map (flex: 1, above the panel) is what shrinks when the keyboard appears — the
        // panel below it keeps its own height, so an address search or a manual-entry field
        // never ends up hidden behind the keyboard (design decision, 2026-09-24: "the keypad
        // covers the form"). 'height' rather than 'undefined' on Android, since this app's
        // edge-to-edge layout doesn't reliably get a windowSoftInputMode=adjustResize resize on
        // its own.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <RouteMap
          origin={effectiveOrigin}
          destination={destination}
          routeOptionLines={optionLines}
          onMapPress={handleMapPress}
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

        <View style={[styles.backOverlay, { top: insets.top + 8 }]} pointerEvents="box-none">
          <RoundButton
            icon="chevron-left"
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            testID="back-button"
          />
        </View>

        <View style={[styles.panel, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
          <SegmentedControl
            options={VEHICLE_MODE_OPTIONS}
            value={vehicleMode}
            onChange={handleSelectVehicleMode}
            testIDPrefix="vehicle-mode"
          />

          {vehicleMode === 'profile' && noVehiclesYet ? (
            <View style={styles.firstUse} testID="first-vehicle-card">
              <View style={styles.firstUseHeader}>
                <Icon name="truck-outline" size={28} color={colors.accent} />
                <Text style={styles.firstUseTitle}>First, tell us about your lorry</Text>
              </View>
              <Text style={styles.firstUseBody}>
                Its height, width, length and weight decide which roads and bridges are safe. Add it
                once and it is remembered for every trip.
              </Text>
              <TouchableOpacity
                style={styles.firstUseButton}
                onPress={() => router.push('/profiles/new')}
                accessibilityRole="button"
                testID="add-first-vehicle-button"
              >
                <Text style={styles.firstUseButtonText}>Add my vehicle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleSelectVehicleMode('manual')}
                testID="first-vehicle-manual-link"
              >
                <Text style={styles.firstUseLink}>Or enter the details just for this trip</Text>
              </TouchableOpacity>
            </View>
          ) : vehicleMode === 'profile' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.profileRow}
            >
              {profilesLoading ? (
                <ActivityIndicator color={colors.text} />
              ) : profiles === undefined || profiles.length === 0 ? (
                <Text style={styles.hint}>
                  No saved vehicles yet — try “Enter details” instead.
                </Text>
              ) : (
                profiles.map((profile) => (
                  <TouchableOpacity
                    key={profile.id}
                    style={[styles.chip, profile.id === selectedProfile?.id && styles.chipSelected]}
                    onPress={() => handleSelectProfile(profile.id)}
                    testID={`profile-chip-${profile.id}`}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        profile.id === selectedProfile?.id && styles.chipTextSelected,
                      ]}
                    >
                      {profile.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.manualForm}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {DIMENSION_FIELDS.map((field) => (
                <View key={field.key}>
                  <Text style={styles.label}>{field.label}</Text>
                  <TextInput
                    style={styles.input}
                    value={dimensionValues[field.key]}
                    onChangeText={setDimensionField(field.key)}
                    placeholder={field.placeholder}
                    placeholderTextColor={colors.textDim}
                    keyboardType="decimal-pad"
                    testID={`manual-${field.key}-input`}
                  />
                </View>
              ))}
            </ScrollView>
          )}

          <PointPicker
            label="From"
            options={FROM_OPTIONS}
            mode={fromMode === 'here' ? 'search' : fromMode}
            onModeChange={handleFromModeChange}
            testID="from"
            collapsed={
              fromMode === 'here'
                ? {
                    text: location.point === undefined ? 'Finding your position…' : 'Your position',
                    actionLabel: 'Change',
                    onAction: () => handleFromModeChange('search'),
                  }
                : undefined
            }
          >
            {fromMode === 'search' ? (
              <AddressSearchField
                placeholder="Search for an address or postcode"
                apiKey={config.maptilerApiKey}
                near={origin ?? location.point}
                onSelect={handleOriginSearchSelect}
                testID="origin-search"
              />
            ) : (
              mapHelp('origin')
            )}
            <TouchableOpacity
              onPress={() => handleFromModeChange('here')}
              accessibilityRole="button"
              testID="from-use-position-button"
            >
              <Text style={styles.linkText}>Use my position instead</Text>
            </TouchableOpacity>
          </PointPicker>

          <PointPicker
            label="To"
            options={TO_OPTIONS}
            mode={toMode}
            onModeChange={handleToModeChange}
            testID="to"
          >
            {toMode === 'search' ? (
              <AddressSearchField
                placeholder="Search for an address or postcode"
                apiKey={config.maptilerApiKey}
                near={effectiveOrigin ?? location.point}
                onSelect={handleDestinationSearchSelect}
                testID="destination-search"
              />
            ) : (
              mapHelp('destination')
            )}
          </PointPicker>

          {displayedError !== undefined && <Text style={styles.error}>{displayedError}</Text>}
          {nextStepHint !== undefined && !pending && (
            <Text style={styles.nextStep} testID="plan-next-step">
              {nextStepHint}
            </Text>
          )}

          {routeOptions === undefined ? (
            <TouchableOpacity
              style={[styles.button, !canPlan && styles.buttonDisabled]}
              disabled={!canPlan}
              onPress={handleCompareRoutes}
              testID="plan-route-button"
            >
              {pendingCompare ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <View style={styles.buttonContent}>
                  <Icon name="navigation-variant" size={26} color={colors.textOnAccent} />
                  <Text style={styles.buttonText}>Plan route</Text>
                </View>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.optionsList}>
              <Text style={styles.label}>Choose a route</Text>
              {routeOptions.map((option, index) => (
                <TouchableOpacity
                  key={`${option.geometry}-${index}`}
                  style={[
                    styles.optionCard,
                    {
                      borderLeftWidth: 6,
                      borderLeftColor: OPTION_COLOURS[index % OPTION_COLOURS.length],
                    },
                  ]}
                  disabled={createRoutePlan.isPending}
                  onPress={() => handleConfirmOption(option)}
                  testID={`route-option-${index}`}
                >
                  <View style={styles.optionIcon}>
                    <Icon
                      name={option.labels.includes('fastest') ? 'lightning-bolt' : 'ruler'}
                      size={26}
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.optionText}>
                    <Text style={styles.optionLabel}>
                      {option.labels
                        .map((l) => (l === 'fastest' ? 'Fastest' : 'Shortest'))
                        .join(' & ')}
                    </Text>
                    <Text style={styles.optionDetail}>
                      {option.distanceKm.toFixed(1)} km · {Math.round(option.durationMin)} min
                      {option.estimatedFuelCostGBP !== undefined
                        ? ` · est. £${option.estimatedFuelCostGBP.toFixed(2)} fuel`
                        : ''}
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={26} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setRouteOptions(undefined)}
                testID="edit-route-button"
              >
                <Text style={styles.editLink}>Change route or vehicle</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
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
    backOverlay: {
      position: 'absolute',
      left: 16,
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    // One split button: the two choices share a track and the active one is filled.
    profileRow: {
      gap: 8,
      minHeight: 44,
    },
    chip: {
      minHeight: 44,
      paddingHorizontal: 16,
      justifyContent: 'center',
      borderRadius: 22,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      backgroundColor: colors.accent,
    },
    chipText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    chipTextSelected: {
      color: colors.textOnAccent,
      fontWeight: '700',
    },
    firstUse: {
      backgroundColor: colors.accentSoft,
      borderRadius: radius.card,
      padding: 14,
      gap: 10,
    },
    firstUseHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    firstUseTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text },
    firstUseBody: { fontSize: 15, color: colors.textSecondary },
    firstUseButton: {
      minHeight: 52,
      borderRadius: radius.card,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    firstUseButtonText: { fontSize: 18, fontWeight: '700', color: colors.textOnAccent },
    firstUseLink: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.accent,
      textAlign: 'center',
    },
    nextStep: { fontSize: 15, fontWeight: '600', color: colors.textMuted, textAlign: 'center' },
    hint: {
      fontSize: 15,
      color: colors.textMuted,
      alignSelf: 'center',
    },
    manualForm: {
      maxHeight: 220,
    },
    label: {
      fontSize: 14,
      color: colors.textMuted,
      marginTop: 8,
    },
    pointHelp: { fontSize: 15, color: colors.textMuted, paddingHorizontal: 4, paddingVertical: 6 },
    // The end the next map tap will set: filled, so it is plain which pin is being placed.
    pointHelpNext: {
      backgroundColor: colors.accentSoft,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.accent,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    pointHelpNextText: { fontSize: 15, fontWeight: '700', color: colors.text },
    linkText: { fontSize: 15, fontWeight: '600', color: colors.accent, paddingVertical: 8 },
    input: {
      minHeight: 52,
      fontSize: 18,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: radius.badge,
      paddingHorizontal: 16,
      marginTop: 4,
    },
    button: {
      minHeight: 56,
      backgroundColor: colors.accent,
      borderRadius: 16,
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
    },
    optionsList: {
      gap: 8,
    },
    optionCard: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: radius.card,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    optionIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    optionText: {
      flex: 1,
    },
    optionLabel: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    optionDetail: {
      fontSize: 15,
      color: colors.textMuted,
      marginTop: 2,
    },
    editLink: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 4,
    },
  });
}
