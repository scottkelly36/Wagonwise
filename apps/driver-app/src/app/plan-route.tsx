import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useVehicleProfiles } from '../api/use-vehicle-profiles';
import { useCreateRoutePlan } from '../api/use-route-plans';
import { RouteMap, type MapPoint } from '../components/route-map';
import { useCurrentLocation } from '../hooks/use-current-location';
import { routingErrorMessage } from '../lib/error-messages';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';

type PointMode = 'origin' | 'destination';

export default function PlanRouteScreen() {
  const router = useRouter();
  const location = useCurrentLocation();
  const { data: profiles, isLoading: profilesLoading } = useVehicleProfiles();
  const createRoutePlan = useCreateRoutePlan();
  const setCurrentRoutePlan = useCurrentRoutePlanStore((s) => s.setPlan);

  const [profileId, setProfileId] = useState<string | undefined>(undefined);
  const [origin, setOrigin] = useState<MapPoint | undefined>(undefined);
  const [destination, setDestination] = useState<MapPoint | undefined>(undefined);
  const [pointMode, setPointMode] = useState<PointMode>('destination');

  // Origin defaults to current location (design doc §8) once it arrives, but only until a
  // driver has actually chosen one for themselves — a GPS fix landing late must never silently
  // override a point they already tapped.
  const effectiveOrigin = origin ?? location.point;

  const selectedProfile = profiles?.find((p) => p.id === profileId);
  const canPlan =
    selectedProfile !== undefined &&
    effectiveOrigin !== undefined &&
    destination !== undefined &&
    !createRoutePlan.isPending;

  function handleMapPress(point: MapPoint): void {
    if (pointMode === 'origin') {
      setOrigin(point);
      setPointMode('destination');
    } else {
      setDestination(point);
    }
  }

  function handlePlan(): void {
    if (
      !canPlan ||
      selectedProfile === undefined ||
      effectiveOrigin === undefined ||
      destination === undefined
    ) {
      return;
    }
    createRoutePlan.mutate(
      { profileId: selectedProfile.id, origin: effectiveOrigin, destination },
      {
        onSuccess: (plan) => {
          setCurrentRoutePlan(plan);
          router.push('/route-overview');
        },
      },
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <RouteMap origin={effectiveOrigin} destination={destination} onMapPress={handleMapPress} />

      <View style={styles.panel}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.profileRow}
        >
          {profilesLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : profiles === undefined || profiles.length === 0 ? (
            <Text style={styles.hint}>Add a vehicle profile first.</Text>
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

        {createRoutePlan.isError && (
          <Text style={styles.error}>{routingErrorMessage(createRoutePlan.error)}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, !canPlan && styles.buttonDisabled]}
          disabled={!canPlan}
          onPress={handlePlan}
          testID="plan-route-button"
        >
          {createRoutePlan.isPending ? (
            <ActivityIndicator color="#0B1220" />
          ) : (
            <Text style={styles.buttonText}>Plan route</Text>
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
  profileRow: {
    gap: 8,
    minHeight: 44,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#1F2937',
  },
  chipSelected: {
    backgroundColor: '#F5A623',
  },
  chipText: {
    fontSize: 16,
    color: '#E5E7EB',
  },
  chipTextSelected: {
    color: '#0B1220',
    fontWeight: '700',
  },
  hint: {
    fontSize: 15,
    color: '#9CA3AF',
    alignSelf: 'center',
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
    backgroundColor: '#1F2937',
  },
  modeButtonActive: {
    backgroundColor: '#334155',
    borderWidth: 2,
    borderColor: '#38BDF8',
  },
  modeButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
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
  },
});
