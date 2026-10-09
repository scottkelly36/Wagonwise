import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { sharingWith, useHoursSharingStore } from '../state/hours-sharing-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { Icon } from './ui/icon';

/** Shown whenever the driver is sharing their driving status with a company, so they always know. */
export function HoursSharingChip() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const companies = useHoursSharingStore((s) => s.companies);
  const names = sharingWith(companies).map((c) => c.companyName);
  if (names.length === 0) return null;
  return (
    <View style={styles.chip} testID="hours-sharing-chip" accessibilityRole="text">
      <Icon name="timer-outline" size={18} color={colors.accent} />
      <Text style={styles.text}>Sharing your driving status with {names.join(', ')}</Text>
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
