import type { FuelStationDto, UnpricedFuelStationDto } from '@wagonwise/contracts/fuel';
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
import { FuelChoiceSwitch } from '../components/fuel-choice-switch';
import { Icon } from '../components/ui/icon';
import { ScreenHeader } from '../components/ui/screen-header';
import { useCurrentLocation } from '../hooks/use-current-location';
import { useNavigateToPlace } from '../hooks/use-navigate-to-spot';
import { useDrivingProfileId } from '../hooks/use-parking-drive-times';
import { jobNavigationErrorMessage } from '../lib/error-messages';
import {
  FUEL_ACCESS_NOTE,
  FUEL_CREDIT,
  FUEL_MAX_AGE_DAYS,
  fuelName,
  isStalePrice,
  noPriceText,
  priceText,
  sortFuel,
  STALE_PRICE_NOTE,
  stationTitle,
  updatedText,
  type FuelOrder,
} from '../lib/fuel-details';
import { shortDistance } from '../lib/uk-distance';
import { useMeasureUnitsStore } from '../state/measure-units-store';
import { useFuelChoiceStore } from '../state/fuel-choice-store';
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
 * Nearby fuel: the diesel or petrol prices around the driver, cheapest or closest first, each with how long ago the station reported it
 * (marked as possibly out of date when it is over a week). Below them, nearby stations with no usable price for the fuel are listed
 * with no number, so a station that sells both but reports one is not missing. Tapping a station plans the route and opens the trip
 * screen, as nearby parking does. Only prices from the last month are asked for (`FUEL_MAX_AGE_DAYS`).
 */
export default function NearbyFuelScreen() {
  const location = useCurrentLocation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [order, setOrder] = useState<FuelOrder>('cheapest');
  const fuelLabel = fuelName(useFuelChoiceStore((s) => s.choice));
  const fuel = useNearbyFuel(location.point, SEARCH_RADIUS_M, LIST_LIMIT);
  const profileId = useDrivingProfileId();
  const navigate = useNavigateToPlace(profileId);

  const rows = useMemo(() => sortFuel(fuel.data?.stations ?? [], order), [fuel.data, order]);
  const unpriced = fuel.data?.withoutPrice ?? [];
  const cheapestId = useMemo(
    () => sortFuel(fuel.data?.stations ?? [], 'cheapest')[0]?.id,
    [fuel.data],
  );
  const now = new Date();
  const loading = location.status === 'loading' || (location.point !== undefined && fuel.isPending);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <ScreenHeader
          title="Nearby fuel"
          subtitle={`${fuelLabel} prices from the last ${FUEL_MAX_AGE_DAYS} days`}
        />
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
        <FuelChoiceSwitch />
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

        {!loading &&
          location.point !== undefined &&
          !fuel.isError &&
          rows.length === 0 &&
          unpriced.length === 0 && (
            <Text style={styles.message} testID="nearby-fuel-empty">
              No recent {fuelLabel.toLowerCase()} prices near you. Try again later.
            </Text>
          )}

        {!loading && !fuel.isError && rows.length === 0 && unpriced.length > 0 && (
          <Text style={styles.message} testID="nearby-fuel-none-priced">
            No {fuelLabel.toLowerCase()} prices reported near you in the last {FUEL_MAX_AGE_DAYS}{' '}
            days. These stations are nearby and may still sell it.
          </Text>
        )}

        {rows.map((station) => (
          <FuelRow
            key={station.id}
            station={station}
            cheapest={station.id === cheapestId}
            fuelLabel={fuelLabel}
            now={now}
            styles={styles}
            colors={colors}
            disabled={navigate.isPending || profileId === undefined}
            onPress={() => navigate.mutate(station.location)}
          />
        ))}

        {unpriced.length > 0 && rows.length > 0 && (
          <Text style={styles.sectionTitle} testID="nearby-fuel-unpriced-heading">
            No recent {fuelLabel.toLowerCase()} price reported
          </Text>
        )}
        {unpriced.map((station) => (
          <UnpricedRow
            key={station.id}
            station={station}
            fuelLabel={fuelLabel}
            styles={styles}
            colors={colors}
            disabled={navigate.isPending || profileId === undefined}
            onPress={() => navigate.mutate(station.location)}
          />
        ))}

        {(rows.length > 0 || unpriced.length > 0) && (
          <>
            <Text style={styles.note}>{FUEL_ACCESS_NOTE}</Text>
            <Text style={styles.note}>{FUEL_CREDIT}</Text>
          </>
        )}
        {profileId === undefined && (rows.length > 0 || unpriced.length > 0) && (
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
  fuelLabel,
  now,
  styles,
  colors,
  disabled,
  onPress,
}: {
  station: FuelStationDto;
  cheapest: boolean;
  fuelLabel: string;
  now: Date;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  disabled: boolean;
  onPress: () => void;
}) {
  const distanceUnit = useMeasureUnitsStore((s) => s.distance);
  return (
    <TouchableOpacity
      style={styles.row}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stationTitle(station)}, ${fuelLabel.toLowerCase()} ${priceText(station.pencePerLitre)} a litre, ${shortDistance(station.distanceM, distanceUnit)} away. Take me there`}
      testID={`fuel-row-${station.id}`}
    >
      <View style={styles.badge}>
        <Icon name="gas-station" size={28} color={FUEL_COLOUR} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {priceText(station.pencePerLitre)}
            <Text style={styles.perLitre}> a litre</Text>
          </Text>
          <Text style={styles.distance}>{shortDistance(station.distanceM, distanceUnit)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {stationTitle(station)}
          {cheapest && <Text style={styles.cheapest}>{'  Cheapest'}</Text>}
        </Text>
        <Text style={styles.updated}>
          {fuelLabel}
          {'  ·  '}
          {updatedText(station.priceUpdatedAt, now)}
          {isStalePrice(station.priceUpdatedAt, now) && (
            <Text style={styles.stale} testID={`fuel-stale-${station.id}`}>
              {`  ·  ${STALE_PRICE_NOTE}`}
            </Text>
          )}
        </Text>
      </View>
      <Icon name="chevron-right" size={26} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

/** A nearby station the answer has no usable price for: its name, how far it is and why there is no number, and the way to it. */
function UnpricedRow({
  station,
  fuelLabel,
  styles,
  colors,
  disabled,
  onPress,
}: {
  station: UnpricedFuelStationDto;
  fuelLabel: string;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  disabled: boolean;
  onPress: () => void;
}) {
  const distanceUnit = useMeasureUnitsStore((s) => s.distance);
  return (
    <TouchableOpacity
      style={styles.row}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stationTitle(station)}, ${noPriceText(fuelLabel).toLowerCase()}, ${shortDistance(station.distanceM, distanceUnit)} away. Take me there`}
      testID={`fuel-unpriced-${station.id}`}
    >
      <View style={styles.badge}>
        <Icon name="gas-station" size={28} color={colors.textMuted} />
      </View>
      <View style={styles.rowText}>
        <View style={styles.priceRow}>
          <Text style={styles.noPrice}>{noPriceText(fuelLabel)}</Text>
          <Text style={styles.distance}>{shortDistance(station.distanceM, distanceUnit)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {stationTitle(station)}
        </Text>
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
    priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    distance: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
    price: { fontSize: 24, fontWeight: '800', color: colors.text },
    perLitre: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    cheapest: { fontSize: 14, fontWeight: '700', color: colors.accentGreen },
    title: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
    updated: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
    stale: { fontSize: 14, fontWeight: '700', color: colors.warning },
    noPrice: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.textSecondary },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textSecondary, marginTop: 8 },
    message: { fontSize: 16, color: colors.textMuted, textAlign: 'center', marginTop: 16 },
    note: { fontSize: 13, color: colors.textDim, textAlign: 'center' },
    error: { fontSize: 16, color: colors.danger, textAlign: 'center' },
  });
}
