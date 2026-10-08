import type { SavedPlaceDto } from '@wagonwise/contracts/places';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useMyPlaces } from '../api/use-places';
import { useNavigateToPlace } from '../hooks/use-navigate-to-spot';
import { useDrivingProfileId } from '../hooks/use-parking-drive-times';
import { PLACE_CATEGORY_ICONS, placesNear } from '../lib/places';
import { shortDistance } from '../lib/uk-distance';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { MarkPlaceSheet } from './mark-place-sheet';
import { PlaceSheet } from './place-sheet';
import type { MapPoint } from './route-map';
import { Icon } from './ui/icon';

interface Props {
  /** The stop the driver is heading for: places marked near it are offered, and a new one is named after it. */
  readonly stop: { readonly name: string; readonly location: MapPoint } | undefined;
}

/**
 * On the job screen: the entrances the company (or the driver) has already marked near this stop, with
 * their notes, and a button to mark the spot they are standing on. The reason it exists: a farm's
 * postcode often lands somewhere other than its gate, and the next driver should not have to find it again.
 */
export function JobPlacesCard({ stop }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mine = useMyPlaces();
  const profileId = useDrivingProfileId();
  const navigate = useNavigateToPlace(profileId);
  const [marking, setMarking] = useState(false);
  const [selected, setSelected] = useState<SavedPlaceDto | undefined>(undefined);

  const near = useMemo(
    () => (stop === undefined ? [] : placesNear(mine.places, stop.location)),
    [mine.places, stop],
  );

  return (
    <View style={styles.card} testID="job-places-card">
      <Text style={styles.title}>Gates and entrances</Text>
      {near.length === 0 ? (
        <Text style={styles.body}>
          Nobody has marked an entrance near this stop yet. If the postcode took you to the wrong
          place, mark the right one once you are there and the next driver will find it.
        </Text>
      ) : (
        near.map(({ place, distanceM }) => (
          <TouchableOpacity
            key={place.id}
            style={styles.row}
            onPress={() => setSelected(place)}
            accessibilityRole="button"
            testID={`job-place-${place.id}`}
          >
            <Icon name={PLACE_CATEGORY_ICONS[place.category]} size={26} color={colors.accent} />
            <View style={styles.rowText}>
              <Text style={styles.rowName}>{place.name}</Text>
              {place.note !== undefined && (
                <Text style={styles.rowNote} numberOfLines={2}>
                  {place.note}
                </Text>
              )}
            </View>
            <Text style={styles.distance}>{shortDistance(distanceM)}</Text>
          </TouchableOpacity>
        ))
      )}
      <TouchableOpacity
        style={styles.mark}
        onPress={() => setMarking(true)}
        accessibilityRole="button"
        testID="job-mark-place-button"
      >
        <Icon name="map-marker-plus-outline" size={22} color={colors.text} />
        <Text style={styles.markText}>Mark this spot as an entrance</Text>
      </TouchableOpacity>

      <MarkPlaceSheet
        visible={marking}
        onClose={() => setMarking(false)}
        stopName={stop?.name}
        companyId={mine.markingCompanyId}
      />
      <PlaceSheet
        place={selected}
        onClose={() => setSelected(undefined)}
        onGo={(place) => navigate.mutate(place.location)}
        goDisabled={navigate.isPending || profileId === undefined}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: { ...cardStyle(colors), padding: 16, gap: 10 },
    title: { fontSize: 14, fontWeight: '600', color: colors.textMuted, textTransform: 'uppercase' },
    body: { fontSize: 15, color: colors.textSecondary },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
    rowText: { flex: 1 },
    rowName: { fontSize: 17, fontWeight: '700', color: colors.text },
    rowNote: { fontSize: 14, color: colors.textSecondary },
    distance: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    mark: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    markText: { fontSize: 16, fontWeight: '700', color: colors.text },
  });
}
