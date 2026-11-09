import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { formatHeightWithFeetInches } from '../lib/units';
import { VEHICLE_PRESETS, type VehiclePreset } from '../lib/vehicle-presets';
import { useThemeColors, type ThemeColors } from '../theme/colors';

interface Props {
  readonly selectedId: string | undefined;
  readonly onPick: (preset: VehiclePreset) => void;
}

/** The figures a preset will fill in, in one line, with the height also in feet and inches as UK bridge signs show it. */
export function presetSummary(preset: VehiclePreset): string {
  const d = preset.dimensions;
  return `${formatHeightWithFeetInches(d.heightM)} high · ${d.widthM} m wide · ${d.lengthM} m long · ${d.grossWeightT} t`;
}

/**
 * Typical lorry sizes to start from, for a driver who does not know their exact figures. Picking one fills the form below
 * (the driver still sees every figure and presses Add), and the figures stay editable.
 */
export function VehiclePresetPicker({ selectedId, onPick }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.wrap} testID="vehicle-preset-picker">
      <Text style={styles.title}>Pick the nearest match</Text>
      <Text style={styles.body}>
        These are typical sizes, not your exact vehicle. Check the height most of all: it decides
        which low bridges you are sent under. Change anything that is different below.
      </Text>
      {VEHICLE_PRESETS.map((preset) => {
        const selected = preset.id === selectedId;
        return (
          <TouchableOpacity
            key={preset.id}
            style={[styles.row, selected && styles.rowSelected]}
            onPress={() => onPick(preset)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${preset.name}. ${presetSummary(preset)}`}
            testID={`vehicle-preset-${preset.id}`}
          >
            <Text style={styles.name}>{preset.name}</Text>
            <Text style={styles.description}>{preset.description}</Text>
            <Text style={styles.figures}>{presetSummary(preset)}</Text>
          </TouchableOpacity>
        );
      })}
      <Text style={styles.body}>
        A tall or double-deck trailer, or a wide or long load? Pick the nearest and change the size,
        or type your own below.
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 8 },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    body: { fontSize: 14, color: colors.textMuted },
    row: {
      minHeight: 72,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 2,
    },
    rowSelected: { borderColor: colors.accent },
    name: { fontSize: 18, fontWeight: '700', color: colors.text },
    description: { fontSize: 14, color: colors.textMuted },
    figures: { fontSize: 14, color: colors.textDim },
  });
}
