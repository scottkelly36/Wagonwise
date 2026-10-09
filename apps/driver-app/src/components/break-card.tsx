import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { BreakPlan, ParkingOnTheWay, ParkingCandidate } from '../lib/break-plan';
import { durationText } from '../lib/driver-hours';
import { formatTime } from '../lib/format-date';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { Icon } from './ui/icon';

interface Props<T extends ParkingCandidate> {
  readonly plan: BreakPlan;
  /** Spots beside the route that come before the break is needed, nearest the limit first. */
  readonly parking: readonly ParkingOnTheWay<T>[];
  readonly onPickParking: (spot: T) => void;
  readonly style?: object;
}

/**
 * On the trip screen when the driver is using the driving-hours clock and the route will run past the time they have:
 * says when a break is needed, offers parking before then, and the arrival time with the break in it. Advice only.
 */
export function BreakCard<T extends ParkingCandidate>({
  plan,
  parking,
  onPickParking,
  style,
}: Props<T>) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  if (plan.kind === 'none' || plan.firstStopInMs === null) return null;
  const limit = plan.kind === 'limit';

  return (
    <View style={[styles.card, style]} testID="break-card">
      <View style={styles.head}>
        <Icon name="coffee-outline" size={24} color={limit ? colors.danger : colors.warning} />
        <View style={styles.headText}>
          <Text style={styles.title}>
            {limit
              ? 'Rest needed before you arrive'
              : `Break needed in ${durationText(plan.firstStopInMs)}`}
          </Text>
          <Text style={styles.sub}>
            {limit
              ? `Your driving limit comes in ${durationText(plan.firstStopInMs)}, before the end of this route.`
              : plan.arrivalMs === null
                ? ''
                : `Arrive about ${formatTime(new Date(plan.arrivalMs))} with ${
                    plan.breaks === 1 ? 'the break' : `${plan.breaks} breaks`
                  }.`}
          </Text>
        </View>
      </View>
      {parking.length > 0 ? (
        parking.map(({ spot, minutes }) => (
          <TouchableOpacity
            key={spot.id}
            style={styles.row}
            onPress={() => onPickParking(spot)}
            accessibilityRole="button"
            testID={`break-parking-${spot.id}`}
          >
            <Text style={styles.rowText}>Parking in {durationText(minutes * 60_000)}</Text>
            <Icon name="chevron-right" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.sub}>No reported parking on this stretch of the route.</Text>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: { ...cardStyle(colors), padding: 12, gap: 8 },
    head: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    headText: { flex: 1 },
    title: { fontSize: 16, fontWeight: '800', color: colors.text },
    sub: { fontSize: 13, color: colors.textMuted },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.divider,
    },
    rowText: { fontSize: 15, fontWeight: '600', color: colors.text },
  });
}
