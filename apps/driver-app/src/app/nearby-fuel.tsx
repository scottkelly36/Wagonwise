import type { FuelStationDto } from '@wagonwise/contracts/fuel';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNearbyFuel } from '../api/use-fuel';
import { FUEL_COLOUR } from '../components/fuel-colour';
import { Icon } from '../components/ui/icon';
import { ScreenHeader } from '../components/ui/screen-header';
import { useCurrentLocation } from '../hooks/use-current-location';
import { useNavigateToPlace } from '../hooks/use-navigate-to-spot';
import { useDrivingProfileId } from '../hooks/use-parking-drive-times';
import { jobNavigationErrorMessage } from '../lib/error-messages';
import {
  FUEL_ACCESS_NOTE,
  FUEL_CREDIT,
  priceText,
  sortFuel,
  stationTitle,
  updatedText,
  type FuelOrder,
} from '../lib/fuel-details';
import { shortDistance } from '../lib/uk-distance';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';

/** How far to look: a lorry driver will go well beyond the high street for a better price, and these are the cheapest in range. */
const SEARCH_RADIUS_M = 30_000;
/** How many stations the list offers. */
const LIST_LIMIT = 20;

const ORDERS: readonly { readonly key: FuelOrder; readonly label: string }[] = [
  { key: 'cheapest', label: 'Cheapest' },
  { key: 'closest', label: 'Closest' },
];

/**
 * Nearby fuel: the diesel prices around the driver, cheapest or closest first, each with how long ago the station reported it.
 * Tapping a station plans the route and opens the trip screen, as nearby parking does. Only prices from the last week are asked
 * for (`FUEL_MAX_AGE_DAYS`).
 */
export default function NearbyFuelScreen() {
  const location = useCurrentLocation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [order, setOrder] = useState<FuelOrder>('cheapest');
  const fuel = useNearbyFuel(location.point, SEARCH_RADIUS_M, LIST_LIMIT);
  const profileId = useDrivingProfileId();
  const navigate = useNavigateToPlace(profileId);

  const rows = useMemo(() => sortFuel(fuel.data?.stations ?? [], order), [fuel.data, order]);
  const cheapestId = useMemo(
    () => sortFuel(fuel.data?.stations ?? [], 'cheapest')[0]?.id,
    [fuel.data],
  );
  const now = new Date();
  const loading = location.status === 'loading' || (location.point !== undefined && fuel.isPending);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <ScreenHeader title="Nearby fuel" subtitle="Diesel prices from the last week" />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={fuel.isRefetching}
            onRefresh={() => void fuel.refetch()}
            tintColor={colors.text}
          />
        }
      >
        <View style={styles.orderRow}>
          {ORDERS.map((o) => (
            <TouchableOpacity
              key={o.key}
              style={[styles.orderButton, order === o.key && styles.orderButtonOn]}
              onPress={() => setOrder(o.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: order === o.key }}
              testID={`fuel-order-${o.key}`}
            >
              <Text style={[styles.orderText, order === o.key && styles.orderTextOn]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading && <ActivityIndicator size="large" color={colors.text} />}

        {!loading && location.point === undefined && (
          <Text style={styles.message}>
            Turn on location so we can find fuel near you, then try again.
          </Text>
        )}

        {!loading && location.point !== undefined && fuel.isError && (
          <Text style={styles.message}>
            Couldn’t load fuel prices. Check your signal and try again.
          </Text>
        )}

        {!loading && location.point !== undefined && !fuel.isError && rows.length === 0 && (
          <Text style={styles.message} testID="nearby-fuel-empty">
            No recent diesel prices near you. Try again later.
          </Text>
        )}

        {rows.map((station) => (
          <FuelRow
            key={station.id}
            station={station}
            cheapest={station.id === cheapestId}
            now={now}
            styles={styles}
            colors={colors}
            disabled={navigate.isPending || profileId === undefined}
            onPress={() => navigate.mutate(station.location)}
          />
        ))}

        {rows.length > 0 && (
          <>
            <Text style={styles.note}>{FUEL_ACCESS_NOTE}</Text>
            <Text style={styles.note}>{FUEL_CREDIT}</Text>
          </>
        )}
        {profileId === undefined && rows.length > 0 && (
          <Text style={styles.message}>
            Add a vehicle profile (More, then Vehicle profiles) to get directions.
          </Text>
        )}
        {navigate.isError && (
          <Text style={styles.error}>{jobNavigationErrorMessage(navigate.error)}</Text>
        )}
        {navigate.isPending && <ActivityIndicator color={colors.text} />}
      </ScrollView>
    </SafeAreaView>
  );
}

function FuelRow({
  station,
  cheapest,
  now,
  styles,
  colors,
  disabled,
  onPress,
}: {
  station: FuelStationDto;
  cheapest: boolean;
  now: Date;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={styles.row}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stationTitle(station)}, ${priceText(station.pencePerLitre)} a litre, ${shortDistance(station.distanceM)} away. Take me there`}
      testID={`fuel-row-${station.id}`}
    >
      <View style={styles.badge}>
        <Icon name="gas-station" size={28} color={FUEL_COLOUR} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.price}>
          {priceText(station.pencePerLitre)}
          {cheapest && <Text style={styles.cheapest}>{'  Cheapest'}</Text>}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {stationTitle(station)}
          <Text style={styles.distance}>
            {'  ·  '}
            {shortDistance(station.distanceM)} away
          </Text>
        </Text>
        <Text style={styles.updated}>{updatedText(station.priceUpdatedAt, now)}</Text>
      </View>
      <Icon name="chevron-right" size={26} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingTop: 8 },
    content: { padding: 16, gap: 12 },
    orderRow: { flexDirection: 'row', gap: 8 },
    orderButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 14,
      borderWidth: 2,
      borderColor: colors.surfaceStrong,
      justifyContent: 'center',
      alignItems: 'center',
    },
    orderButtonOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    orderText: { fontSize: 17, fontWeight: '700', color: colors.text },
    orderTextOn: { color: colors.textOnAccent },
    row: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      minHeight: 84,
    },
    badge: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    rowText: { flex: 1 },
    price: { fontSize: 24, fontWeight: '800', color: colors.text },
    cheapest: { fontSize: 14, fontWeight: '700', color: colors.accentGreen },
    title: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
    distance: { fontSize: 15, fontWeight: '500', color: colors.textMuted },
    updated: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
    message: { fontSize: 16, color: colors.textMuted, textAlign: 'center', marginTop: 16 },
    note: { fontSize: 13, color: colors.textDim, textAlign: 'center' },
    error: { fontSize: 16, color: colors.danger, textAlign: 'center' },
  });
}
