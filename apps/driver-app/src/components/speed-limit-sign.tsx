import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { speedLimitLabel, type SpeedLimitSign } from '../lib/speed-limit';
import { cardStyle } from '../theme/tokens';
import { useThemeColors, type ThemeColors } from '../theme/colors';

const SIZE = 64;

/**
 * The speed limit for where the driver is, drawn like the road sign: a number in a red ring, or the white disc with a
 * black diagonal for the national speed limit. A guide only: the label tells a screen reader to check the signs, and the
 * app never claims a limit it does not know.
 */
export function SpeedLimitSignView({ sign }: { readonly sign: SpeedLimitSign }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={speedLimitLabel(sign)}
      testID="speed-limit-sign"
    >
      {sign.kind === 'limit' ? (
        <View style={styles.ring}>
          <Text style={styles.number} allowFontScaling={false}>
            {sign.mph}
          </Text>
        </View>
      ) : (
        <View style={styles.national}>
          <View style={styles.stripe} />
        </View>
      )}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      ...cardStyle(colors),
      width: SIZE + 8,
      height: SIZE + 8,
      borderRadius: (SIZE + 8) / 2,
      padding: 4,
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    ring: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      borderWidth: 7,
      borderColor: '#D32F2F',
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    number: { fontSize: 28, fontWeight: '900', color: '#111111' },
    national: {
      width: SIZE,
      height: SIZE,
      borderRadius: SIZE / 2,
      borderWidth: 3,
      borderColor: '#111111',
      backgroundColor: '#FFFFFF',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    stripe: {
      width: SIZE * 1.3,
      height: 6,
      backgroundColor: '#111111',
      transform: [{ rotate: '-45deg' }],
    },
  });
}
