import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MANEUVER_ICONS } from '../lib/maneuver-icons';
import type { UpcomingTurn } from '../lib/turn-guidance';
import { shortDistance } from '../lib/uk-distance';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { Icon } from './ui/icon';

interface Props {
  readonly next: UpcomingTurn | undefined;
  readonly offRoute: boolean;
  readonly muted: boolean;
  readonly replanning: boolean;
  readonly replanFailed: boolean;
  readonly onToggleMute: () => void;
  readonly onReplan: () => void;
}

/**
 * The turn card at the top of the trip screen: an arrow, how far to the next turn, and what to do
 * there; or, once the driver has left the route, a "Re-plan from here" button. A tap-only button:
 * a new route is never chosen for the driver.
 */
export function TurnBanner({
  next,
  offRoute,
  muted,
  replanning,
  replanFailed,
  onToggleMute,
  onReplan,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (!next && !offRoute) return null;

  const mute = (
    <TouchableOpacity
      onPress={onToggleMute}
      accessibilityRole="button"
      accessibilityLabel={muted ? 'Turn voice off. Tap to turn on' : 'Turn voice on. Tap to mute'}
      style={styles.mute}
      testID="turn-mute-button"
    >
      <Icon name={muted ? 'volume-off' : 'volume-high'} size={26} color={colors.textMuted} />
    </TouchableOpacity>
  );

  if (offRoute) {
    return (
      <View style={styles.card} testID="turn-banner-off-route">
        <Icon name="map-marker-question-outline" size={34} color={colors.warning} />
        <View style={styles.body}>
          <Text style={styles.title}>You’ve left the route</Text>
          {replanFailed && <Text style={styles.error}>Couldn’t plan a new route. Try again.</Text>}
        </View>
        <TouchableOpacity
          style={[styles.replan, replanning && styles.disabled]}
          disabled={replanning}
          onPress={onReplan}
          testID="replan-button"
        >
          {replanning ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={styles.replanText}>Re-plan from here</Text>
          )}
        </TouchableOpacity>
        {mute}
      </View>
    );
  }

  if (!next) return null;
  const street = next.maneuver.streetNames[0];
  return (
    <View style={styles.card} testID="turn-banner">
      <Icon name={MANEUVER_ICONS[next.maneuver.kind]} size={40} color={colors.accent} />
      <View style={styles.body}>
        <Text style={styles.distance}>{shortDistance(next.distanceM)}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {street ?? next.maneuver.text}
        </Text>
      </View>
      {mute}
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
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    body: { flex: 1 },
    distance: { fontSize: 24, fontWeight: '800', color: colors.text },
    title: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
    error: { fontSize: 14, color: colors.danger },
    mute: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    replan: {
      minHeight: 48,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    replanText: { fontSize: 16, fontWeight: '700', color: colors.textOnAccent },
    disabled: { opacity: 0.5 },
  });
}
