import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useWhatsNew } from '../hooks/use-whats-new';
import { whatsNewPoints } from '../lib/whats-new';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';

/**
 * "What's new": the newest note from WagonWise about what has changed, shown once on the home screen and never while driving (it is not mounted on the
 * trip screen). "Got it" is the only way to close it, so a driver reads it or taps past it knowingly, and it does not come back.
 */
export function WhatsNewCard() {
  const { announcement, dismiss } = useWhatsNew();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (announcement === undefined) return null;

  return (
    <View
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 72 }]}
      pointerEvents="box-none"
      testID="whats-new"
    >
      <View style={styles.card}>
        <Text style={styles.kicker}>What’s new</Text>
        <Text style={styles.title} testID="whats-new-title">
          {announcement.title}
        </Text>
        {whatsNewPoints(announcement.body).map((point) => (
          <Text key={point} style={styles.point} testID="whats-new-point">
            {point}
          </Text>
        ))}
        <TouchableOpacity
          style={styles.button}
          onPress={dismiss}
          accessibilityRole="button"
          testID="whats-new-dismiss"
        >
          <Text style={styles.buttonText}>Got it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { position: 'absolute', left: 12, right: 12, zIndex: 40 },
    card: { ...cardStyle(colors), padding: 16, gap: 6 },
    kicker: { fontSize: 13, fontWeight: '700', color: colors.accent, textTransform: 'uppercase' },
    title: { fontSize: 19, fontWeight: '800', color: colors.text },
    point: { fontSize: 15, color: colors.textMuted },
    button: {
      marginTop: 8,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: colors.accentGreen,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonText: { fontSize: 17, fontWeight: '700', color: colors.textOnAccent },
  });
}
