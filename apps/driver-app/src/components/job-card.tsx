import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { cardStyle, radius } from '../theme/tokens';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { Icon } from './ui/icon';

interface Props {
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly onPress: () => void;
  readonly testID?: string;
}

/** The current job as a card: a truck badge, the job's name and where it is heading. Used on the
 *  map and in the Jobs tab, so the same job always looks the same. */
export function JobCard({ title, subtitle, onPress, testID }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      testID={testID}
    >
      <View style={styles.badge}>
        <Icon name="truck" size={30} color={colors.accent} />
      </View>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle !== undefined && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
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
      width: 52,
      height: 52,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    text: { flex: 1 },
    title: { fontSize: 20, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 15, color: colors.textMuted, marginTop: 2 },
  });
}
