import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useChecksDue } from '../api/use-checks';
import { dueSummary } from '../lib/check-due';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';
import { Icon } from './ui/icon';

/**
 * "Daily check" on the Jobs tab and the job screen, while the vehicle on the driver's current job has a walk-round
 * check still to do. Shows nothing when the firm has no lists for the vehicle, when they are all done, or when there
 * is no vehicle yet, so a firm that doesn't use checks never sees it.
 */
export function CheckDueCard() {
  const router = useRouter();
  const { view } = useChecksDue();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const summary = view === undefined ? undefined : dueSummary(view);
  if (summary === undefined) return null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/check')}
      accessibilityRole="button"
      accessibilityLabel={`Daily check due. ${summary}`}
      testID="check-due-card"
    >
      <View style={styles.badge}>
        <Icon name="clipboard-check-outline" size={28} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title}>Daily check due</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {summary}
        </Text>
      </View>
      <Icon name="arrow-right" size={24} color={colors.textMuted} />
    </TouchableOpacity>
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
      minHeight: 72,
    },
    badge: {
      width: 48,
      height: 48,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: { flex: 1 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 14, color: colors.textMuted },
  });
}
