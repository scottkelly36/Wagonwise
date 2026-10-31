import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FUEL_CHOICES } from '../lib/fuel-details';
import { useFuelChoiceStore } from '../state/fuel-choice-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';

/** Diesel or Petrol. The choice is shared, so the Nearby fuel list and the map pins always show the same fuel. */
export function FuelChoiceSwitch({ compact = false }: { readonly compact?: boolean }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const choice = useFuelChoiceStore((s) => s.choice);
  const setChoice = useFuelChoiceStore((s) => s.setChoice);

  return (
    <View style={styles.row}>
      {FUEL_CHOICES.map((c) => (
        <TouchableOpacity
          key={c.key}
          style={[styles.button, choice === c.key && styles.buttonOn]}
          onPress={() => void setChoice(c.key)}
          accessibilityRole="button"
          accessibilityState={{ selected: choice === c.key }}
          testID={`fuel-choice-${c.key}`}
        >
          <Text style={[styles.text, choice === c.key && styles.textOn]}>{c.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors, compact: boolean) {
  return StyleSheet.create({
    row: { flexDirection: 'row', gap: 8 },
    button: {
      flex: 1,
      minHeight: compact ? 40 : 48,
      borderRadius: compact ? 12 : 14,
      borderWidth: 2,
      borderColor: colors.surfaceStrong,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    text: { fontSize: compact ? 15 : 17, fontWeight: '700', color: colors.text },
    textOn: { color: colors.textOnAccent },
  });
}
