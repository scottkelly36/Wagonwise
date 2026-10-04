import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useDeleteVehicleProfile,
  useUpdateVehicleProfile,
  useVehicleProfile,
} from '../../api/use-vehicle-profiles';
import { VehicleProfileForm } from '../../components/vehicle-profile-form';
import { routingErrorMessage } from '../../lib/error-messages';
import { vehicleProfileFormValuesFrom } from '../../lib/vehicle-profile-form';
import { useThemeColors, type ThemeColors } from '../../theme/colors';

export default function EditVehicleProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: profile, isLoading, isError } = useVehicleProfile(id);
  const updateMutation = useUpdateVehicleProfile();
  const deleteMutation = useDeleteVehicleProfile();
  const [deleteError, setDeleteError] = useState<string | undefined>(undefined);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

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
        <ActivityIndicator style={styles.loading} size="large" color={colors.text} />
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
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
              <ActivityIndicator color={colors.danger} />
            ) : (
              <Text style={styles.deleteButtonText}>Delete vehicle</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
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
    content: {
      padding: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    loading: {
      marginTop: 48,
    },
    message: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: 48,
      paddingHorizontal: 24,
    },
    deleteButton: {
      minHeight: 56,
      borderWidth: 1,
      borderColor: colors.danger,
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
      color: colors.danger,
    },
    error: {
      fontSize: 16,
      color: colors.danger,
      marginTop: 12,
      textAlign: 'center',
    },
  });
}
