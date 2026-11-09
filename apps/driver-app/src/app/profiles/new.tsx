import { useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCreateVehicleProfile } from '../../api/use-vehicle-profiles';
import { ScreenHeader } from '../../components/ui/screen-header';
import { VehiclePresetPicker } from '../../components/vehicle-preset-picker';
import { VehicleProfileForm } from '../../components/vehicle-profile-form';
import { routingErrorMessage } from '../../lib/error-messages';
import { presetFormValues, type VehiclePreset } from '../../lib/vehicle-presets';
import { EMPTY_VEHICLE_PROFILE_FORM } from '../../lib/vehicle-profile-form';
import { useThemeColors, type ThemeColors } from '../../theme/colors';

export default function NewVehicleProfileScreen() {
  const router = useRouter();
  const createMutation = useCreateVehicleProfile();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [preset, setPreset] = useState<VehiclePreset | undefined>(undefined);
  const scrollRef = useRef<ScrollView>(null);
  const formTop = useRef(0);

  function pick(next: VehiclePreset): void {
    setPreset(next);
    // The figures are filled in below the list, so take the driver down to see them before they press Add.
    scrollRef.current?.scrollTo?.({ y: formTop.current, animated: true });
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenHeader title="Add a vehicle" />
          <VehiclePresetPicker selectedId={preset?.id} onPick={pick} />
          <View
            onLayout={(event) => {
              formTop.current = event.nativeEvent.layout.y;
            }}
          >
            {/* Remounted when a preset is picked, so the form starts from that preset's figures. */}
            <VehicleProfileForm
              key={preset?.id ?? 'blank'}
              initialValues={
                preset === undefined ? EMPTY_VEHICLE_PROFILE_FORM : presetFormValues(preset)
              }
              submitLabel="Add vehicle"
              pending={createMutation.isPending}
              errorMessage={
                createMutation.isError ? routingErrorMessage(createMutation.error) : undefined
              }
              onSubmit={(input) => createMutation.mutate(input, { onSuccess: () => router.back() })}
            />
          </View>
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
