import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle } from '../../theme/tokens';
import { Icon } from './icon';

interface Props {
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** Where Back goes when there is nothing to go back to (a screen opened cold). */
  readonly fallbackHref?: '/home' | '/more';
  /** Something to sit on the right, e.g. a status chip. */
  readonly right?: ReactNode;
}

/**
 * The top of a screen that opens above the tabs: a round Back button and a big title, in the same
 * lifted style as the cards. Stack screens have no system header, and on iPhone there is no hardware
 * back, so every such screen carries its own way out.
 */
export function ScreenHeader({ title, subtitle, fallbackHref = '/home', right }: Props) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={styles.back}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallbackHref))}
        accessibilityRole="button"
        accessibilityLabel="Back"
        testID="back-button"
      >
        <Icon name="chevron-left" size={30} color={colors.text} />
      </TouchableOpacity>
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
      {right}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    back: {
      ...cardStyle(colors),
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: 'center',
      alignItems: 'center',
    },
    text: { flex: 1 },
    title: { fontSize: 28, fontWeight: '800', color: colors.text },
    subtitle: { fontSize: 15, color: colors.textMuted },
  });
}
