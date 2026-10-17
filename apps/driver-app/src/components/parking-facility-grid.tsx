import { PARKING_FACILITIES, type ParkingFacility } from '@wagonwise/contracts/parking';
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FACILITY_WORDS, nextFacility } from '../lib/parking-suggestion';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';

interface Props {
  readonly value: Readonly<Record<ParkingFacility, boolean | undefined>>;
  readonly onChange: (next: Readonly<Record<ParkingFacility, boolean | undefined>>) => void;
  /** Prefix for the buttons' test ids, so two screens can use it. */
  readonly testIdPrefix: string;
}

const stateWord = (value: boolean | undefined): string =>
  value === undefined ? 'Not sure' : value ? 'Yes' : 'No';

/** The "what is there" buttons for a parking spot: tap one to go from not sure to yes, then flip between yes and no. */
export function ParkingFacilityGrid({ value, onChange, testIdPrefix }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.grid}>
      {PARKING_FACILITIES.map((key) => {
        const current = value[key];
        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.facility,
              current === true && styles.facilityYes,
              current === false && styles.facilityNo,
            ]}
            onPress={() => onChange({ ...value, [key]: nextFacility(current) })}
            accessibilityRole="button"
            accessibilityLabel={`${FACILITY_WORDS[key]}: ${stateWord(current)}`}
            testID={`${testIdPrefix}-${key}`}
          >
            <Text style={styles.name}>{FACILITY_WORDS[key]}</Text>
            <Text style={styles.state}>{stateWord(current)}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    facility: {
      width: '48%',
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.badge,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    facilityYes: { backgroundColor: colors.accentSoft },
    facilityNo: { opacity: 0.7 },
    name: { fontSize: 15, fontWeight: '700', color: colors.text },
    state: { fontSize: 13, color: colors.textMuted },
  });
}
