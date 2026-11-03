import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { CLOSURES_CREDIT } from '../lib/closure-details';
import type { ClosureOnRoute } from '../lib/closures-on-route';
import {
  hasFullClosure,
  MAX_LISTED_CLOSURES,
  routeClosureDetail,
  routeClosureHeadline,
} from '../lib/route-closure-text';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { closureColour } from './closure-colour';
import { Icon } from './ui/icon';

interface Props {
  /** The closures the route runs along that will be in force when the driver gets there. */
  readonly items: readonly ClosureOnRoute[];
  /** Whether closures have been fetched. Until they have, nothing is said: "none" would be a claim nobody has checked. */
  readonly ready: boolean;
  readonly onSelect: (closureId: string) => void;
}

/**
 * The "Road closures" part of the route screen: which closures the planned route runs through and when the driver would reach them.
 * It only reports, as the routes do not avoid closures yet, and says so when a whole road is shut.
 */
export function RouteClosuresSection({ items, ready, onSelect }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!ready) return null;
  const listed = items.slice(0, MAX_LISTED_CLOSURES);
  const more = items.length - listed.length;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>Road closures</Text>
      {items.length === 0 ? (
        <Text style={styles.empty} testID="route-closures-none">
          None found on this route.
        </Text>
      ) : (
        <>
          {hasFullClosure(items) && (
            <Text style={styles.warning} testID="route-closure-warning">
              Your route goes through a road closure. Check it before you set off.
            </Text>
          )}
          {listed.map((item) => (
            <TouchableOpacity
              key={item.closure.id}
              onPress={() => onSelect(item.closure.id)}
              style={styles.row}
              accessibilityRole="button"
              testID={`route-closure-${item.closure.id}`}
            >
              <Icon name="account-hard-hat" size={24} color={closureColour(item.closure.kind)} />
              <View style={styles.rowText}>
                <Text style={styles.headline}>{routeClosureHeadline(item)}</Text>
                <Text style={styles.detail}>{routeClosureDetail(item)}</Text>
              </View>
            </TouchableOpacity>
          ))}
          {more > 0 && (
            <Text style={styles.detail} testID="route-closures-more">
              {`and ${more} more on this route`}
            </Text>
          )}
          <Text style={styles.credit}>{CLOSURES_CREDIT}</Text>
        </>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: { gap: 4 },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    empty: { fontSize: 16, color: colors.textSecondary },
    warning: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.danger,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: radius.badge,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
    rowText: { flex: 1 },
    headline: { fontSize: 16, fontWeight: '600', color: colors.text },
    detail: { fontSize: 14, color: colors.textSecondary },
    credit: { fontSize: 12, color: colors.textDim },
  });
}
