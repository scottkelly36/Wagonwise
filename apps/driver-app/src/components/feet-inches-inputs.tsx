import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';

import { feetInchesToMetres, metresToFeetInchesBoxes } from '../lib/units';
import { useThemeColors, type ThemeColors } from '../theme/colors';

interface Props {
  /** The value, in metres as text, that the boxes start from. */
  readonly metres: string;
  readonly onChangeMetres: (metres: string) => void;
  readonly feetPlaceholder: string;
  readonly inchesPlaceholder: string;
  /** The look of a text box on the screen it is used on. */
  readonly inputStyle: StyleProp<TextStyle>;
  /** Each box gets `${testIDPrefix}-feet-input` and `${testIDPrefix}-inches-input`. */
  readonly testIDPrefix: string;
}

/**
 * A feet box and an inches box that report their value in metres, which is what the form checks and sends. The boxes start from the
 * current value and then belong to the driver: typing "6" inches does not rewrite it as "0 ft 6 in" under their fingers. Use a `key`
 * that includes the unit, so the boxes are filled afresh from the value in metres when the unit is changed.
 */
export function FeetInchesInputs({
  metres,
  onChangeMetres,
  feetPlaceholder,
  inchesPlaceholder,
  inputStyle,
  testIDPrefix,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [boxes, setBoxes] = useState(() => metresToFeetInchesBoxes(metres));

  function change(next: { feet: string; inches: string }) {
    setBoxes(next);
    onChangeMetres(feetInchesToMetres(next.feet, next.inches));
  }

  return (
    <View style={styles.row}>
      <View style={styles.box}>
        <TextInput
          style={[inputStyle, styles.grow]}
          value={boxes.feet}
          onChangeText={(feet) => change({ ...boxes, feet })}
          placeholder={feetPlaceholder}
          placeholderTextColor={colors.textDim}
          keyboardType="decimal-pad"
          accessibilityLabel="feet"
          testID={`${testIDPrefix}-feet-input`}
        />
        <Text style={styles.unit}>ft</Text>
      </View>
      <View style={styles.box}>
        <TextInput
          style={[inputStyle, styles.grow]}
          value={boxes.inches}
          onChangeText={(inches) => change({ ...boxes, inches })}
          placeholder={inchesPlaceholder}
          placeholderTextColor={colors.textDim}
          keyboardType="decimal-pad"
          accessibilityLabel="inches"
          testID={`${testIDPrefix}-inches-input`}
        />
        <Text style={styles.unit}>in</Text>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: 12,
    },
    box: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    grow: {
      flex: 1,
    },
    unit: {
      fontSize: 18,
      color: colors.textMuted,
    },
  });
}
