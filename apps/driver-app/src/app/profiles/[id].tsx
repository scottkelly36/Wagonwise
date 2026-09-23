import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';

import {
  useDeleteVehicleProfile,
  useUpdateVehicleProfile,
  useVehicleProfile,
} from '../../api/use-vehicle-profiles';
import { VehicleProfileForm } from '../../components/vehicle-profile-form';
import { routingErrorMessage } from '../../lib/error-messages';
import { vehicleProfileFormValuesFrom } from '../../lib/vehicle-profile-form';

export default function EditVehicleProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: profile, isLoading, isError } = useVehicleProfile(id);
  const updateMutation = useUpdateVehicleProfile();
  const deleteMutation = useDeleteVehicleProfile();
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined);

  function confirmDelete(): void {
    Alert.alert('Delete this vehicle?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteMutation.mutate(id, {
            onSuccess: () => router.replace('/profiles'),
            onError: (error) => setDeleteError(routingErrorMessage(error)),
          });
        },
      },
    ]);
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={styles.loading} size="large" color="#FFFFFF" />
      </SafeAreaView>
    );
  }

  if (isError || profile === undefined) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.message}>That vehicle is no longer there.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{profile.name}</Text>
        <VehicleProfileForm
          initialValues={vehicleProfileFormValuesFrom(profile)}
          submitLabel="Save changes"
          pending={updateMutation.isPending}
          errorMessage={
            updateMutation.isError ? routingErrorMessage(updateMutation.error) : undefined
          }
          onSubmit={(input) =>
            updateMutation.mutate({ id, input }, { onSuccess: () => router.back() })
          }
        />

        {deleteError !== undefined && <Text style={styles.error}>{deleteError}</Text>}
        <TouchableOpacity
          style={[styles.deleteButton, deleteMutation.isPending && styles.buttonDisabled]}
          disabled={deleteMutation.isPending}
          onPress={confirmDelete}
          testID="delete-profile-button"
        >
          {deleteMutation.isPending ? (
            <ActivityIndicator color="#F87171" />
          ) : (
            <Text style={styles.deleteButtonText}>Delete vehicle</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  loading: {
    marginTop: 48,
  },
  message: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 48,
    paddingHorizontal: 24,
  },
  deleteButton: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 32,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F87171',
  },
  error: {
    fontSize: 16,
    color: '#F87171',
    marginTop: 12,
    textAlign: 'center',
  },
});
