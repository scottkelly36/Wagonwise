import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import type { RouteOptionDto } from '@wagonwise/contracts/routing';

import { formatDuration } from '../lib/format-duration';
import { hazardCountLine } from '../lib/hazard-marker';
import {
  cheapestLine,
  costLine,
  euroVIUnknown,
  hillsLine,
  hillsWereChecked,
  routeHasDetails,
  routeOptionTitle,
  routeSummaryIsWarning,
  routeSummaryLine,
  routesHeading,
  tollLines,
  ZONE_CREDIT,
  zoneLines,
  zonesShown,
} from '../lib/route-option-text';
import { formatRouteDistance, type DistanceUnit } from '../lib/units';
import { WEIGHT_LIMIT_BANNER, WEIGHT_LIMIT_SHORT } from '../lib/weight-limit-warning';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { Icon } from './ui/icon';

// One colour per route option, drawn on the map and repeated on its card so the two can be matched.
// Indigo, magenta, amber: in the app's blue-violet family for the first, and none of them a pale blue,
// which reads as a river on the base map (design decision, 2026-09-24).
const HILLS_UNAVAILABLE =
  'The hill check is not available yet, so these routes are not checked for hills.';

export const OPTION_COLOURS = ['#5B4BDB', '#D6336C', '#E8890C'] as const;

interface Props {
  readonly options: readonly RouteOptionDto[];
  /** Whether the routes were looked for as for a loaded vehicle, so the hill note is only shown when it applies. */
  readonly comparedLoaded: boolean;
  readonly distanceUnit: DistanceUnit;
  /** How many known hazards are on each route, by position. Undefined when they are not known yet. */
  readonly hazardCounts?: readonly number[] | undefined;
  /** Disables the cards while a route is being made. */
  readonly busy: boolean;
  readonly onChoose: (option: RouteOptionDto) => void;
  /** The saved vehicle the routes are for, when there is one, so the card can offer to say whether it is Euro VI. */
  readonly euroViVehicle?: { readonly id: string; readonly name: string } | undefined;
  /** The cards and the notes under them never take more than this much of the screen. */
  readonly maxHeightFraction?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The route cards a driver chooses from: the heading, one card per route with its time, distance, money, zones and hazards (folded to one line, with
 * Details to open the rest), and the notes under them. Shared by Plan route and the route choice on a job, so a driver sees the same on both.
 */
export function RouteOptionsList({
  options,
  comparedLoaded,
  distanceUnit,
  hazardCounts,
  busy,
  onChoose,
  euroViVehicle,
  maxHeightFraction = 0.5,
  style,
}: Props) {
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { height: windowHeight } = useWindowDimensions();
  // Which route cards have their details open, by the route's line. A card starts folded to its one-line summary.
  const [openCards, setOpenCards] = useState<ReadonlySet<string>>(new Set());
  function toggleCard(geometry: string): void {
    setOpenCards((current) => {
      const next = new Set(current);
      if (!next.delete(geometry)) next.add(geometry);
      return next;
    });
  }

  return (
    <View style={[styles.optionsList, style]}>
      <Text style={styles.label} testID="routes-heading">
        {routesHeading(options.length)}
      </Text>
      {/* Cards with toll and zone lines are tall: three of them ran off the bottom of the screen with no way to reach
                  the last. They scroll inside half the screen, and the map keeps the rest. */}
      <ScrollView
        style={{ maxHeight: Math.round(windowHeight * maxHeightFraction) }}
        contentContainerStyle={styles.optionsScroll}
        showsVerticalScrollIndicator
        testID="route-options-scroll"
      >
        {comparedLoaded && !hillsWereChecked(options) && (
          <Text style={styles.presetNote} testID="hills-unavailable">
            {HILLS_UNAVAILABLE}
          </Text>
        )}
        {options.some((option) => option.breaksWeightLimit === true) && (
          <Text style={styles.weightWarning} testID="weight-limit-banner">
            {WEIGHT_LIMIT_BANNER}
          </Text>
        )}
        {options.map((option, index) => (
          <TouchableOpacity
            key={`${option.geometry}-${index}`}
            style={[
              styles.optionCard,
              {
                borderLeftWidth: 6,
                borderLeftColor: OPTION_COLOURS[index % OPTION_COLOURS.length],
              },
            ]}
            disabled={busy}
            onPress={() => onChoose(option)}
            testID={`route-option-${index}`}
          >
            <View style={styles.optionIcon}>
              <Icon
                name={
                  option.labels.includes('fastest')
                    ? 'lightning-bolt'
                    : option.labels.includes('gentle')
                      ? 'terrain'
                      : option.labels.includes('shortest')
                        ? 'ruler'
                        : 'cash-remove'
                }
                size={26}
                color={colors.accent}
              />
            </View>
            <View style={styles.optionText}>
              <Text style={styles.optionLabel}>{routeOptionTitle(option)}</Text>
              <Text style={styles.optionDetail}>
                {formatRouteDistance(option.distanceKm, distanceUnit)} ·{' '}
                {formatDuration(option.durationMin)}
                {option.estimatedFuelCostGBP !== undefined
                  ? ` · est. £${option.estimatedFuelCostGBP.toFixed(2)} fuel`
                  : ''}
              </Text>
              {/* Folded: one line for money, zones and hazards, so three cards fit in the list. Details opens the rest. */}
              {!openCards.has(option.geometry) &&
                routeSummaryLine(
                  option,
                  hazardCounts === undefined ? undefined : (hazardCounts[index] ?? 0),
                ) !== undefined && (
                  <Text
                    style={
                      routeSummaryIsWarning(option) ? styles.optionWarning : styles.optionDetail
                    }
                    testID={`route-option-${index}-summary`}
                  >
                    {routeSummaryLine(
                      option,
                      hazardCounts === undefined ? undefined : (hazardCounts[index] ?? 0),
                    )}
                  </Text>
                )}
              {openCards.has(option.geometry) && (
                <>
                  {hazardCounts !== undefined && (
                    <Text style={styles.optionDetail} testID={`route-option-${index}-hazards`}>
                      {hazardCountLine(hazardCounts?.[index] ?? 0)}
                    </Text>
                  )}
                  {hillsLine(option, distanceUnit) !== undefined && (
                    <Text style={styles.optionDetail} testID={`route-option-${index}-hills`}>
                      {hillsLine(option, distanceUnit)}
                    </Text>
                  )}
                  {tollLines(option).map((line, lineIndex) => (
                    <View key={line.text}>
                      <Text
                        style={styles.optionDetail}
                        testID={`route-option-${index}-toll${lineIndex === 0 ? '' : `-${lineIndex}`}`}
                      >
                        {line.text}
                      </Text>
                      {line.detail !== undefined && (
                        <Text
                          style={styles.optionDetail}
                          testID={`route-option-${index}-toll-detail${lineIndex === 0 ? '' : `-${lineIndex}`}`}
                        >
                          {line.detail}
                        </Text>
                      )}
                    </View>
                  ))}
                  {costLine(option) !== undefined && (
                    <Text style={styles.optionDetail} testID={`route-option-${index}-cost`}>
                      {costLine(option)}
                    </Text>
                  )}
                  {cheapestLine(option, options) !== undefined && (
                    <Text style={styles.optionDetail} testID={`route-option-${index}-cheapest`}>
                      {cheapestLine(option, options)}
                    </Text>
                  )}
                  {zoneLines(option).map((line, lineIndex) => (
                    <Text
                      key={line.text}
                      style={line.charged ? styles.optionWarning : styles.optionDetail}
                      testID={`route-option-${index}-zone${lineIndex === 0 ? '' : `-${lineIndex}`}`}
                    >
                      {line.text}
                    </Text>
                  ))}
                </>
              )}
              {option.breaksWeightLimit === true && (
                <Text style={styles.optionWarning}>{WEIGHT_LIMIT_SHORT}</Text>
              )}
              {(routeHasDetails(option, options, distanceUnit) || hazardCounts !== undefined) && (
                <TouchableOpacity
                  style={styles.detailsButton}
                  onPress={() => toggleCard(option.geometry)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openCards.has(option.geometry) }}
                  testID={`route-option-${index}-details`}
                >
                  <Text style={styles.detailsText}>
                    {openCards.has(option.geometry) ? 'Hide details' : 'Details'}
                  </Text>
                  <Icon
                    name={openCards.has(option.geometry) ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={colors.accent}
                  />
                </TouchableOpacity>
              )}
            </View>
            <Icon name="chevron-right" size={26} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
        {euroVIUnknown(options) && euroViVehicle !== undefined && (
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/profiles/[id]',
                params: { id: euroViVehicle.id },
              })
            }
            accessibilityRole="button"
            testID="say-euro-vi"
          >
            <Text style={styles.linkText}>Say whether {euroViVehicle.name} is Euro VI</Text>
          </TouchableOpacity>
        )}
        {zonesShown(options) && (
          <Text style={styles.presetNote} testID="zone-credit">
            {ZONE_CREDIT}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    optionsList: { gap: 8 },
    optionsScroll: { gap: 8 },
    label: { fontSize: 14, color: colors.textMuted, marginTop: 8 },
    presetNote: { fontSize: 13, color: colors.textMuted, marginTop: 6 },
    weightWarning: { fontSize: 15, color: colors.warning },
    optionCard: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      borderRadius: radius.card,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
    },
    optionIcon: {
      width: 48,
      height: 48,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    optionText: { flex: 1 },
    optionLabel: { fontSize: 18, fontWeight: '700', color: colors.text },
    optionDetail: { fontSize: 15, color: colors.textMuted, marginTop: 2 },
    optionWarning: { fontSize: 15, fontWeight: '600', color: colors.warning, marginTop: 2 },
    // Its own target inside the card: tapping it opens the details, tapping anywhere else on the card chooses the route.
    detailsButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      alignSelf: 'flex-start',
      paddingRight: 12,
    },
    detailsText: { fontSize: 15, fontWeight: '700', color: colors.accent },
    linkText: { fontSize: 15, fontWeight: '600', color: colors.accent, paddingVertical: 8 },
  });
}
