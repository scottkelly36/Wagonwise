import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { PlanRouteRequest } from '@wagonwise/contracts/routing';

import { useCreateVehicleProfile, useVehicleProfiles } from '../api/use-vehicle-profiles';
import { useNearbyHazards } from '../api/use-hazards';
import { useCreateRoutePlan } from '../api/use-route-plans';
import { AddressSearchField } from '../components/address-search-field';
import { HazardDetailDrawer } from '../components/hazard-detail-drawer';
import { RouteMap, type MapPoint } from '../components/route-map';
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
import { useThemeColors, type ThemeColors } from '../theme/colors';

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

export default function PlanRouteScreen() {
  const router = useRouter();
  const location = useCurrentLocation();
  const { data: profiles, isLoading: profilesLoading } = useVehicleProfiles();
  const createVehicleProfile = useCreateVehicleProfile();
  const createRoutePlan = useCreateRoutePlan();
  const setCurrentRoutePlan = useCurrentRoutePlanStore((s) => s.setPlan);

  const [vehicleMode, setVehicleMode] = useState<VehicleMode>('profile');
  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [dimensionValues, setDimensionValues] = useState(EMPTY_VEHICLE_PROFILE_FORM);
  const [manualError, setManualError] = useState<string | undefined>(undefined);
  const [origin, setOrigin] = useState<MapPoint | undefined>(undefined);
  const [destination, setDestination] = useState<MapPoint | undefined>(undefined);
  const [pointMode, setPointMode] = useState<PointMode>('destination');
  const [selectedHazardId, setSelectedHazardId] = useState<string | undefined>(undefined);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Origin defaults to current location (design doc §8) once it arrives, but only until a
  // driver has actually chosen one for themselves — a GPS fix landing late must never silently
  // override a point they already tapped.
  const effectiveOrigin = origin ?? location.point;

  const corridor = [effectiveOrigin, destination].filter((p): p is MapPoint => p !== undefined);
  const nearbyHazards = useNearbyHazards(corridor, NEARBY_RADIUS_M);

  const selectedProfile = profiles?.find((p) => p.id === profileId);
  const pending = createVehicleProfile.isPending || createRoutePlan.isPending;
  const canPlan =
    effectiveOrigin !== undefined &&
    destination !== undefined &&
    !pending &&
    (vehicleMode === 'manual' || selectedProfile !== undefined);

  function setDimensionField(field: keyof Omit<VehicleProfileFormValues, 'name'>) {
    return (text: string) => {
      setManualError(undefined);
      setDimensionValues((current) => ({ ...current, [field]: text }));
    };
  }

  function handleMapPress(point: MapPoint): void {
    if (pointMode === 'origin') {
      setOrigin(point);
      setPointMode('destination');
    } else {
      setDestination(point);
    }
  }

  function handleOriginSearchSelect(result: GeocodingResult): void {
    setOrigin(result.point);
  }

  function handleDestinationSearchSelect(result: GeocodingResult): void {
    setDestination(result.point);
  }

  function planWith(
    profileId: PlanRouteRequest['profileId'],
    origin: MapPoint,
    destination: MapPoint,
  ): void {
    createRoutePlan.mutate(
      { profileId, origin, destination },
      {
        onSuccess: (plan) => {
          setCurrentRoutePlan(plan);
          router.push('/route-overview');
        },
      },
    );
  }

  function handlePlan(): void {
    if (!canPlan || effectiveOrigin === undefined || destination === undefined) return;

    if (vehicleMode === 'profile') {
      if (selectedProfile === undefined) return;
      planWith(selectedProfile.id, effectiveOrigin, destination);
      return;
    }

    // Manual entry: create the profile first — silently, no separate save step — then plan with
    // it. This is a real, ordinary vehicle profile once created (visible under Vehicle profiles
    // afterwards), not a throwaway; a driver who never wants to name one up front still ends up
    // with a reusable one for next time.
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
      { onSuccess: (profile) => planWith(profile.id, effectiveOrigin, destination) },
    );
  }

  const displayedError =
    manualError ??
    (createVehicleProfile.isError
      ? routingErrorMessage(createVehicleProfile.error)
      : createRoutePlan.isError
        ? routingErrorMessage(createRoutePlan.error)
        : undefined);

  return (
    <SafeAreaView style={styles.container}>
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

        <View style={styles.panel}>
          <View style={styles.vehicleModeRow}>
            <TouchableOpacity
              style={[
                styles.vehicleModeTab,
                vehicleMode === 'profile' && styles.vehicleModeTabActive,
              ]}
              onPress={() => setVehicleMode('profile')}
              testID="vehicle-mode-profile-button"
            >
              <Text style={styles.vehicleModeTabText}>My vehicles</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.vehicleModeTab,
                vehicleMode === 'manual' && styles.vehicleModeTabActive,
              ]}
              onPress={() => setVehicleMode('manual')}
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
                    onPress={() => setProfileId(profile.id)}
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

          <TouchableOpacity
            style={[styles.button, !canPlan && styles.buttonDisabled]}
            disabled={!canPlan}
            onPress={handlePlan}
            testID="plan-route-button"
          >
            {pending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>Plan route</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
      padding: 16,
      gap: 12,
      backgroundColor: colors.background,
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
      backgroundColor: colors.surfaceStrong,
      borderWidth: 2,
      borderColor: colors.accentBlue,
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
      minHeight: 48,
      fontSize: 18,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 12,
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
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    modeButtonActive: {
      backgroundColor: colors.surfaceStrong,
      borderWidth: 2,
      borderColor: colors.accentBlue,
    },
    modeButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
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
    error: {
      fontSize: 16,
      color: colors.danger,
    },
  });
}
