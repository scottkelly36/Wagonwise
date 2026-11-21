import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { gpsSpeedLabel, type GpsSpeedReading } from '../lib/gps-speed';
import { cardStyle } from '../theme/tokens';
import { useThemeColors, type ThemeColors } from '../theme/colors';

const HEIGHT = 72;

/**
 * The phone's GPS speed, in a box beside the speed limit sign: a big number, then the unit and "GPS" underneath. It is a number
 * only, with no colour or warning when it is over the limit (the limit comes from map data and can be wrong), and it says GPS so
 * it is never taken for the speedometer.
 */
export function GpsSpeedBox({ reading }: { readonly reading: GpsSpeedReading }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={gpsSpeedLabel(reading)}
      testID="gps-speed"
    >
      <Text style={styles.number} allowFontScaling={false} testID="gps-speed-value">
        {reading.value}
      </Text>
      <Text style={styles.unit} allowFontScaling={false}>
        {reading.unit === 'kph' ? 'km/h' : 'mph'} GPS
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      ...cardStyle(colors),
      minWidth: HEIGHT,
      height: HEIGHT,
      paddingHorizontal: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    number: { fontSize: 30, fontWeight: '900', color: colors.text, lineHeight: 34 },
    unit: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  });
}
