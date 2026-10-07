import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useThemeColors, type ThemeColors } from '../theme/colors';
import { Icon } from './ui/icon';

/** Shown whenever the company can see the driver's position, so a driver always knows. */
export function PositionSharingChip() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.chip} testID="position-sharing-chip" accessibilityRole="text">
      <Icon name="map-marker-radius-outline" size={18} color={colors.accent} />
      <Text style={styles.text}>Your company can see your position</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: colors.card,
    },
    text: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  });
}
