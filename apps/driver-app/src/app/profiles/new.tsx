import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateVehicleProfile } from '../../api/use-vehicle-profiles';
import { ScreenHeader } from '../../components/ui/screen-header';
import { VehicleProfileForm } from '../../components/vehicle-profile-form';
import { routingErrorMessage } from '../../lib/error-messages';
import { EMPTY_VEHICLE_PROFILE_FORM } from '../../lib/vehicle-profile-form';
import { useThemeColors, type ThemeColors } from '../../theme/colors';

export default function NewVehicleProfileScreen() {
  const router = useRouter();
  const createMutation = useCreateVehicleProfile();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ScreenHeader title="Add a vehicle" />
          <VehicleProfileForm
            initialValues={EMPTY_VEHICLE_PROFILE_FORM}
            submitLabel="Add vehicle"
            pending={createMutation.isPending}
            errorMessage={
              createMutation.isError ? routingErrorMessage(createMutation.error) : undefined
            }
            onSubmit={(input) => createMutation.mutate(input, { onSuccess: () => router.back() })}
          />
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
      padding: 16,
      gap: 8,
    },
  });
}
