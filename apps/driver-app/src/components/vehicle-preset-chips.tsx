import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { VEHICLE_PRESETS, type VehiclePreset } from '../lib/vehicle-presets';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { VehicleDrawing } from './vehicle-drawing';

interface Props {
  readonly selectedId: string | undefined;
  readonly onPick: (preset: VehiclePreset) => void;
}

/**
 * The same typical sizes as the Add a vehicle screen, as a row of small cards for the route planner, where there is little
 * room: a drawing and a name each. Picking one fills the size boxes below; they stay editable.
 */
export function VehiclePresetChips({ selectedId, onPick }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
      testID="vehicle-preset-chips"
    >
      {VEHICLE_PRESETS.map((preset) => {
        const selected = preset.id === selectedId;
        return (
          <TouchableOpacity
            key={preset.id}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onPick(preset)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`vehicle-preset-chip-${preset.id}`}
          >
            <VehicleDrawing kind={preset.drawing} width={72} />
            <Text style={[styles.name, selected && styles.nameSelected]}>{preset.name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { gap: 8, paddingVertical: 2 },
    chip: {
      minHeight: 72,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      backgroundColor: colors.surface,
    },
    chipSelected: { borderColor: colors.accent },
    name: { fontSize: 13, color: colors.textSecondary },
    nameSelected: { color: colors.text, fontWeight: '700' },
  });
}
