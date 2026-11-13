import { useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useConnectionStore } from '../state/connection-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { Icon } from './ui/icon';

/** Shown while the phone cannot reach WagonWise, so a driver knows why things are not updating. It goes by itself when signal is back. */
export function NoSignalChip({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  const offline = useConnectionStore((s) => s.offline);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!offline) return null;
  return (
    <View style={[styles.chip, style]} testID="no-signal-chip" accessibilityRole="text">
      <Icon name="signal-off" size={18} color={colors.accent} />
      <Text style={styles.text}>No signal</Text>
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
