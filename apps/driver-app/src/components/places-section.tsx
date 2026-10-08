import type { SavedPlaceDto } from '@wagonwise/contracts/places';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useMyPlaces } from '../api/use-places';
import { useCurrentLocation } from '../hooks/use-current-location';
import { useNavigateToPlace } from '../hooks/use-navigate-to-spot';
import { useDrivingProfileId } from '../hooks/use-parking-drive-times';
import { distanceMetres } from '../lib/geo-distance';
import { PLACE_CATEGORY_ICONS } from '../lib/place-icons';
import { shortDistance } from '../lib/uk-distance';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { MarkPlaceSheet } from './mark-place-sheet';
import { PlaceSheet } from './place-sheet';
import { Icon } from './ui/icon';

/**
 * The Saved tab's list of places the driver and their company have marked (a farm's real gate, a
 * yard entrance), nearest first when the position is known, with a button to mark the spot they are on.
 */
export function PlacesSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mine = useMyPlaces();
  const location = useCurrentLocation();
  const profileId = useDrivingProfileId();
  const navigate = useNavigateToPlace(profileId);
  const [marking, setMarking] = useState(false);
  const [selected, setSelected] = useState<SavedPlaceDto | undefined>(undefined);

  const rows = useMemo(() => {
    const here = location.point;
    return mine.places
      .map((place) => ({
        place,
        distanceM: here === undefined ? undefined : distanceMetres(here, place.location),
      }))
      .sort((a, b) =>
        a.distanceM !== undefined && b.distanceM !== undefined
          ? a.distanceM - b.distanceM
          : a.place.name.localeCompare(b.place.name),
      );
  }, [mine.places, location.point]);

  return (
    <View style={styles.section} testID="places-section">
      <Text style={styles.heading}>Places</Text>
      <Text style={styles.sub}>
        {mine.shared
          ? 'Gates and entrances marked by you and your company.'
          : 'Gates and entrances you have marked.'}
      </Text>

      {rows.length === 0 && !mine.isLoading && (
        <View style={styles.empty}>
          <Icon name="barn" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            Nothing marked yet. When a farm’s postcode takes you to the wrong place, stand at the
            real gate and mark it. Next time it is there, with your note.
          </Text>
        </View>
      )}

      {rows.map(({ place, distanceM }) => (
        <TouchableOpacity
          key={place.id}
          style={styles.row}
          onPress={() => setSelected(place)}
          accessibilityRole="button"
          testID={`saved-place-${place.id}`}
        >
          <Icon name={PLACE_CATEGORY_ICONS[place.category]} size={28} color={colors.accent} />
          <View style={styles.rowText}>
            <Text style={styles.rowName}>{place.name}</Text>
            {place.note !== undefined && (
              <Text style={styles.rowNote} numberOfLines={2}>
                {place.note}
              </Text>
            )}
            {place.companyId === undefined && mine.shared && (
              <Text style={styles.rowMeta}>Only you</Text>
            )}
          </View>
          {distanceM !== undefined && (
            <Text style={styles.distance}>{shortDistance(distanceM)}</Text>
          )}
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.mark}
        onPress={() => setMarking(true)}
        accessibilityRole="button"
        testID="saved-mark-place-button"
      >
        <Icon name="map-marker-plus-outline" size={22} color={colors.textOnAccent} />
        <Text style={styles.markText}>Mark a place here</Text>
      </TouchableOpacity>

      <MarkPlaceSheet
        visible={marking}
        onClose={() => setMarking(false)}
        companyId={mine.markingCompanyId}
      />
      <PlaceSheet
        place={selected}
        onClose={() => setSelected(undefined)}
        onGo={(place) => navigate.mutate(place.location)}
        goDisabled={navigate.isPending || profileId === undefined}
        shareCompanyId={mine.markingCompanyId}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    section: { gap: 10, marginBottom: 8 },
    heading: { fontSize: 22, fontWeight: '800', color: colors.text },
    sub: { fontSize: 15, color: colors.textMuted },
    empty: { ...cardStyle(colors), padding: 20, alignItems: 'center', gap: 10 },
    emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
    row: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      minHeight: 64,
    },
    rowText: { flex: 1 },
    rowName: { fontSize: 17, fontWeight: '700', color: colors.text },
    rowNote: { fontSize: 14, color: colors.textSecondary },
    rowMeta: { fontSize: 13, color: colors.textMuted },
    distance: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
    mark: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.accent,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    markText: { fontSize: 17, fontWeight: '700', color: colors.textOnAccent },
  });
}
