import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
  EMPTY_VEHICLE_PROFILE_FORM,
  parseVehicleProfileForm,
  type VehicleProfileFormValues,
} from '../lib/vehicle-profile-form';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { Icon } from '../components/ui/icon';
import { RoundButton } from '../components/ui/round-button';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';

type PointMode = 'origin' | 'destination';
type VehicleMode = 'profile' | 'manual';

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
  const [pointMode, setPointMode] = useState<PointMode>('destination');
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Origin defaults to current location (design doc §8) once it arrives, but only until a
  // driver has actually chosen one for themselves — a GPS fix landing late must never silently
  // override a point they already tapped.
  const effectiveOrigin = origin ?? location.point;

  const corridor = [effectiveOrigin, destination].filter((p): p is MapPoint => p !== undefined);
  const nearbyHazards = useNearbyHazards(corridor, NEARBY_RADIUS_M);

  const selectedProfile = profiles?.find((p) => p.id === profileId);
  const pending =
    createVehicleProfile.isPending || createRoutePlan.isPending || previewRouteOptions.isPending;
  const canPlan =
    effectiveOrigin !== undefined &&
    destination !== undefined &&
    !pending &&
    (vehicleMode === 'manual' || selectedProfile !== undefined);

  function setDimensionField(field: keyof Omit<VehicleProfileFormValues, 'name'>) {
    return (text: string) => {
      setManualError(undefined);
      setRouteOptions(undefined);
      setDimensionValues((current) => ({ ...current, [field]: text }));
    };
  }

  function handleMapPress(point: MapPoint): void {
    setRouteOptions(undefined);
    if (pointMode === 'origin') {
      setOrigin(point);
      setPointMode('destination');
    } else {
      setDestination(point);
    }
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
          <View style={styles.vehicleModeRow}>
            <TouchableOpacity
              style={[
                styles.vehicleModeTab,
                vehicleMode === 'profile' && styles.vehicleModeTabActive,
              ]}
              onPress={() => handleSelectVehicleMode('profile')}
              testID="vehicle-mode-profile-button"
            >
              <Text style={styles.vehicleModeTabText}>My vehicles</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.vehicleModeTab,
                vehicleMode === 'manual' && styles.vehicleModeTabActive,
              ]}
              onPress={() => handleSelectVehicleMode('manual')}
              testID="vehicle-mode-manual-button"
            >
              <Text style={styles.vehicleModeTabText}>Enter details</Text>
            </TouchableOpacity>
          </View>

          {vehicleMode === 'profile' ? (
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
                    style={[styles.chip, profile.id === profileId && styles.chipSelected]}
                    onPress={() => handleSelectProfile(profile.id)}
                    testID={`profile-chip-${profile.id}`}
                  >
                    <Text
                      style={[styles.chipText, profile.id === profileId && styles.chipTextSelected]}
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

          <AddressSearchField
            label="From"
            placeholder="Search for an address, or tap the map"
            apiKey={config.maptilerApiKey}
            near={effectiveOrigin ?? location.point}
            onSelect={handleOriginSearchSelect}
            testID="origin-search"
          />
          <AddressSearchField
            label="To"
            placeholder="Search for an address, or tap the map"
            apiKey={config.maptilerApiKey}
            near={effectiveOrigin ?? location.point}
            onSelect={handleDestinationSearchSelect}
            testID="destination-search"
          />

          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, pointMode === 'origin' && styles.modeButtonActive]}
              onPress={() => setPointMode('origin')}
              testID="mode-origin-button"
            >
              <Text style={styles.modeButtonText}>Tap to set start</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, pointMode === 'destination' && styles.modeButtonActive]}
              onPress={() => setPointMode('destination')}
              testID="mode-destination-button"
            >
              <Text style={styles.modeButtonText}>Tap to set destination</Text>
            </TouchableOpacity>
          </View>

          {displayedError !== undefined && <Text style={styles.error}>{displayedError}</Text>}

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
    vehicleModeRow: {
      flexDirection: 'row',
      gap: 8,
    },
    vehicleModeTab: {
      flex: 1,
      minHeight: 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 22,
      backgroundColor: colors.surface,
    },
    vehicleModeTabActive: {
      backgroundColor: colors.accentSoft,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    vehicleModeTabText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
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
    input: {
      minHeight: 52,
      fontSize: 18,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: radius.badge,
      paddingHorizontal: 16,
      marginTop: 4,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
    },
    modeButton: {
      flex: 1,
      minHeight: 56,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.badge,
      backgroundColor: colors.surface,
    },
    modeButtonActive: {
      backgroundColor: colors.accentSoft,
      borderWidth: 2,
      borderColor: colors.accent,
    },
    modeButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
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
