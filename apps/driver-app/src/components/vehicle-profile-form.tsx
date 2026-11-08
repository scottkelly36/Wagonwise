import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { FeetInchesInputs } from './feet-inches-inputs';
import { SegmentedControl } from './ui/segmented-control';
import { formatHeightWithFeetInches, type LengthUnit } from '../lib/units';
import { useLengthUnitStore } from '../state/length-unit-store';
import {
  dimensionWarnings,
  parseVehicleProfileForm,
  type ParsedVehicleProfile,
  type VehicleProfileFormValues,
} from '../lib/vehicle-profile-form';
import { useThemeColors, type ThemeColors } from '../theme/colors';

interface Props {
  readonly initialValues: VehicleProfileFormValues;
  readonly submitLabel: string;
  readonly pending: boolean;
  /** A server-side error from the last submit attempt (e.g. a network failure) — distinct from
   *  the inline validation error this component derives itself, since a driver correcting a typo
   *  shouldn't still see a stale "couldn't reach the server" message from a previous attempt. */
  readonly errorMessage: string | undefined;
  readonly onSubmit: (input: ParsedVehicleProfile) => void;
}

const UNIT_OPTIONS: readonly { key: LengthUnit; label: string }[] = [
  { key: 'metres', label: 'Metres' },
  { key: 'feet', label: 'Feet and inches' },
];

export function VehicleProfileForm({
  initialValues,
  submitLabel,
  pending,
  errorMessage,
  onSubmit,
}: Props) {
  const [values, setValues] = useState(initialValues);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const unit = useLengthUnitStore((s) => s.unit);
  const setUnit = useLengthUnitStore((s) => s.setUnit);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function setField(field: keyof VehicleProfileFormValues) {
    return (text: string) => {
      setValidationError(undefined);
      setValues((current) => ({ ...current, [field]: text }));
    };
  }

  function handleSubmit() {
    const result = parseVehicleProfileForm(values);
    if (!result.ok) {
      setValidationError(result.message);
      return;
    }
    onSubmit(result.value);
  }

  const heightPreview = formatHeightWithFeetInches(Number(values.heightM));
  const warnings = dimensionWarnings(values);
  const displayedError = validationError ?? errorMessage;

  /** One of height, width or length: a single box in metres, or a feet box and an inches box. Either way the form keeps the
   *  value in metres, which is what is checked and sent. */
  function renderSize(
    field: 'heightM' | 'widthM' | 'lengthM',
    name: string,
    metresPlaceholder: string,
    [feetPlaceholder, inchesPlaceholder]: readonly [string, string],
    testName: string,
  ) {
    const warning = warnings[field];
    const metres = Number(values[field]);
    return (
      <>
        <Text style={styles.label}>
          {name} ({unit === 'feet' ? 'feet and inches' : 'metres'})
        </Text>
        {unit === 'feet' ? (
          // Remounted when the unit changes, so the boxes are filled afresh from the value in metres.
          <FeetInchesInputs
            key={`${field}-${unit}`}
            metres={values[field]}
            onChangeMetres={setField(field)}
            feetPlaceholder={feetPlaceholder}
            inchesPlaceholder={inchesPlaceholder}
            inputStyle={styles.input}
            testIDPrefix={`profile-${testName}`}
          />
        ) : (
          <TextInput
            style={styles.input}
            value={values[field]}
            onChangeText={setField(field)}
            placeholder={metresPlaceholder}
            placeholderTextColor={colors.textDim}
            keyboardType="decimal-pad"
            testID={`profile-${testName}-input`}
          />
        )}
        {warning !== undefined && (
          <Text style={styles.warning} testID={`profile-${testName}-warning`}>
            {warning}
          </Text>
        )}
        {unit === 'feet'
          ? Number.isFinite(metres) &&
            metres > 0 && (
              <Text style={styles.hint} testID={`profile-${testName}-metres`}>
                {metres.toFixed(2)} m
              </Text>
            )
          : field === 'heightM' &&
            heightPreview !== '' && <Text style={styles.hint}>{heightPreview}</Text>}
      </>
    );
  }

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={values.name}
        onChangeText={setField('name')}
        placeholder="e.g. The big wagon"
        placeholderTextColor={colors.textDim}
        testID="profile-name-input"
      />

      <Text style={styles.label}>Measure height, width and length in</Text>
      <SegmentedControl
        options={UNIT_OPTIONS}
        value={unit}
        onChange={(next) => void setUnit(next)}
        testIDPrefix="profile-unit"
      />

      {renderSize('heightM', 'Height', '4.2', ['13', '9'], 'height')}
      {renderSize('widthM', 'Width', '2.6', ['8', '6'], 'width')}
      {renderSize('lengthM', 'Length', '16.5', ['54', '2'], 'length')}

      <Text style={styles.label}>Gross weight (tonnes)</Text>
      <TextInput
        style={styles.input}
        value={values.grossWeightT}
        onChangeText={setField('grossWeightT')}
        placeholder="32"
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
        testID="profile-weight-input"
      />
      {warnings.grossWeightT !== undefined && (
        <Text style={styles.warning} testID="profile-weight-warning">
          {warnings.grossWeightT}
        </Text>
      )}

      <Text style={styles.label}>Axle weight (tonnes, optional)</Text>
      <TextInput
        style={styles.input}
        value={values.axleWeightT}
        onChangeText={setField('axleWeightT')}
        placeholder="10"
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
        testID="profile-axle-weight-input"
      />
      {warnings.axleWeightT !== undefined && (
        <Text style={styles.warning} testID="profile-axle-weight-warning">
          {warnings.axleWeightT}
        </Text>
      )}

      <Text style={styles.label}>Fuel consumption (L/100km, optional)</Text>
      <TextInput
        style={styles.input}
        value={values.fuelConsumptionL100km}
        onChangeText={setField('fuelConsumptionL100km')}
        placeholder="30"
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
        testID="profile-fuel-consumption-input"
      />
      <Text style={styles.hint}>Used only for a rough fuel-cost estimate on route options.</Text>

      {displayedError !== undefined && <Text style={styles.error}>{displayedError}</Text>}

      <TouchableOpacity
        style={[styles.button, pending && styles.buttonDisabled]}
        disabled={pending}
        onPress={handleSubmit}
        testID="profile-submit-button"
      >
        {pending ? (
          <ActivityIndicator color={colors.textOnAccent} />
        ) : (
          <Text style={styles.buttonText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    form: {
      gap: 8,
    },
    label: {
      fontSize: 16,
      color: colors.textMuted,
      marginTop: 16,
    },
    input: {
      minHeight: 56,
      fontSize: 20,
      color: colors.text,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 16,
      marginTop: 8,
    },
    warning: {
      fontSize: 14,
      color: colors.warning,
      marginTop: 4,
    },
    hint: {
      fontSize: 14,
      color: colors.textDim,
      marginTop: 4,
    },
    button: {
      minHeight: 56,
      backgroundColor: colors.accent,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 24,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    error: {
      fontSize: 16,
      color: colors.danger,
      marginTop: 12,
    },
  });
}
