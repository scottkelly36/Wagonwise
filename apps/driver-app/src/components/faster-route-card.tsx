import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { FasterRouteOffer } from '../hooks/use-faster-route';
import { comparisonText, savingText } from '../lib/faster-route';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { Icon } from './ui/icon';

interface Props {
  readonly offer: FasterRouteOffer;
  readonly switching: boolean;
  readonly failed: boolean;
  readonly onSwitch: () => void;
  readonly onKeep: () => void;
  readonly style?: StyleProp<ViewStyle>;
}

/** A quiet offer over the map while driving: a quicker route exists. The driver chooses; it goes away by itself if ignored. */
export function FasterRouteCard({ offer, switching, failed, onSwitch, onKeep, style }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.card, style]} testID="faster-route-card">
      <View style={styles.head}>
        <Icon name="directions-fork" size={26} color={colors.accentGreen} />
        <View style={styles.headText}>
          <Text style={styles.title}>{savingText(offer.savingMinutes)}</Text>
          <Text style={styles.sub}>
            {failed
              ? 'Could not switch. You are still on your route.'
              : comparisonText(offer.currentMinutes, offer.alternativeMinutes)}
          </Text>
        </View>
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.button, styles.switchButton, switching && styles.disabled]}
          disabled={switching}
          onPress={onSwitch}
          accessibilityRole="button"
          testID="faster-route-switch"
        >
          {switching ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={styles.switchText}>Switch</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.keepButton]}
          disabled={switching}
          onPress={onKeep}
          accessibilityRole="button"
          testID="faster-route-keep"
        >
          <Text style={styles.keepText}>Keep current route</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: { ...cardStyle(colors), padding: 12, gap: 10 },
    head: { flexDirection: 'row', gap: 10, alignItems: 'center' },
    headText: { flex: 1 },
    title: { fontSize: 17, fontWeight: '800', color: colors.text },
    sub: { fontSize: 13, color: colors.textMuted },
    buttons: { flexDirection: 'row', gap: 10 },
    button: {
      flex: 1,
      minHeight: 48,
      borderRadius: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    switchButton: { backgroundColor: colors.accentGreen },
    keepButton: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.textDim },
    disabled: { opacity: 0.6 },
    switchText: { fontSize: 17, fontWeight: '700', color: colors.textOnAccent },
    keepText: { fontSize: 15, fontWeight: '700', color: colors.text },
  });
}
