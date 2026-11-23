import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { pausedCompanyMessage } from '../lib/paused-company';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { usePausedCompanyStore } from '../state/paused-company-store';
import { Icon } from './ui/icon';

/** One line on the map when the driver's firm has a paused account and so its job is hidden. Nothing when it has not. */
export function PausedCompanyNotice() {
  const name = usePausedCompanyStore((s) => s.name);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (name === undefined) return null;
  return (
    <View style={styles.card} testID="paused-company-notice" accessibilityRole="alert">
      <Icon name="pause-circle-outline" size={26} color={colors.textMuted} />
      <Text style={styles.text}>{pausedCompanyMessage(name)}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 12,
    },
    text: { flex: 1, fontSize: 15, color: colors.text },
  });
}
