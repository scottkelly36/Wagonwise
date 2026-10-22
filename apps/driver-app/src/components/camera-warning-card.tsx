import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { cameraWarningText, type CameraAhead } from '../lib/camera-ahead';
import { OSM_CREDIT } from '../lib/parking-details';
import { shortDistance } from '../lib/uk-distance';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { Icon } from './ui/icon';

/**
 * "Speed camera ahead, 300 yd": a small card on the map while the next camera on the route is close. A courtesy only: the
 * map data is not complete and mobile cameras are not in it, so the driver still watches the signs.
 */
export function CameraWarningCard({ ahead }: { readonly ahead: CameraAhead }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const text = cameraWarningText(ahead.camera);
  const distance = shortDistance(ahead.distanceM);
  const detail =
    ahead.camera.maxspeedMph === undefined
      ? distance
      : `${distance} · ${ahead.camera.maxspeedMph} mph`;
  return (
    <View
      style={styles.card}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${text}, ${detail}`}
      testID="camera-warning"
    >
      <Icon name="camera-outline" size={26} color={colors.warning} />
      <View>
        <Text style={styles.title}>{text}</Text>
        <Text style={styles.distance}>{detail}</Text>
        <Text style={styles.credit}>{OSM_CREDIT}</Text>
      </View>
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
      paddingHorizontal: 16,
    },
    title: { fontSize: 16, fontWeight: '800', color: colors.text },
    distance: { fontSize: 14, color: colors.textMuted },
    credit: { fontSize: 10, color: colors.textDim },
  });
}
