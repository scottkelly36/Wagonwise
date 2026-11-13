import { useMemo } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import type { MeasurementDto } from '@wagonwise/contracts/hazards';

import { canTypeInFeet, measurementEcho, measurementLabelFor } from '../lib/hazard-labels';
import { useLengthUnitStore } from '../state/length-unit-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { FeetInchesInputs } from './feet-inches-inputs';

interface Props {
  readonly kind: MeasurementDto['kind'];
  /** The value in the unit the server keeps (metres, or tonnes for a weight), as text. */
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/**
 * The measurement box on the report screen. A height or width can be typed in feet and inches, as on the sign, when that is the unit the driver
 * chose for vehicle sizes; either way it is kept in metres. Under it, what that comes to in the other unit, so feet typed into a metres box
 * (13.9 for 13 ft 9 in, which would be a bridge 13.9 m high) is seen as it is typed.
 */
export function HazardMeasurementInput({ kind, value, onChange }: Props) {
  const unit = useLengthUnitStore((s) => s.unit);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const inFeet = unit === 'feet' && canTypeInFeet(kind);
  const echo = measurementEcho(kind, value, unit);

  return (
    <>
      <Text style={styles.label}>{measurementLabelFor(kind, unit)}</Text>
      {inFeet ? (
        // Remounted when the kind or unit changes, so the boxes are filled afresh from the value in metres.
        <FeetInchesInputs
          key={`${kind}-${unit}`}
          metres={value}
          onChangeMetres={onChange}
          feetPlaceholder={kind === 'height' ? '13' : '8'}
          inchesPlaceholder={kind === 'height' ? '9' : '6'}
          inputStyle={styles.input}
          testIDPrefix="hazard-measurement"
        />
      ) : (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={kind === 'weight' ? 'e.g. 7.5' : 'e.g. 3.5'}
          placeholderTextColor={colors.textDim}
          keyboardType="decimal-pad"
          testID="hazard-measurement-input"
        />
      )}
      {echo !== undefined && (
        <Text style={styles.hint} testID="hazard-measurement-echo">
          {echo}
        </Text>
      )}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  // The same look as the other boxes on the report screen.
  return StyleSheet.create({
    label: { fontSize: 16, color: colors.textMuted, marginTop: 16 },
    input: {
      minHeight: 56,
      fontSize: 18,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: radius.badge,
      paddingHorizontal: 16,
      marginTop: 8,
    },
    hint: { fontSize: 14, color: colors.textMuted },
  });
}
