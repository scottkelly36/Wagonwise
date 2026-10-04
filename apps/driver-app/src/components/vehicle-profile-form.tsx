import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { formatHeightWithFeetInches } from '../lib/units';
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

export function VehicleProfileForm({
  initialValues,
  submitLabel,
  pending,
  errorMessage,
  onSubmit,
}: Props) {
  const [values, setValues] = useState(initialValues);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
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

      <Text style={styles.label}>Height (metres)</Text>
      <TextInput
        style={styles.input}
        value={values.heightM}
        onChangeText={setField('heightM')}
        placeholder="4.2"
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
        testID="profile-height-input"
      />
      {warnings.heightM !== undefined && (
        <Text style={styles.warning} testID="profile-height-warning">
          {warnings.heightM}
        </Text>
      )}
      {heightPreview !== '' && <Text style={styles.hint}>{heightPreview}</Text>}

      <Text style={styles.label}>Width (metres)</Text>
      <TextInput
        style={styles.input}
        value={values.widthM}
        onChangeText={setField('widthM')}
        placeholder="2.6"
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
        testID="profile-width-input"
      />
      {warnings.widthM !== undefined && (
        <Text style={styles.warning} testID="profile-width-warning">
          {warnings.widthM}
        </Text>
      )}

      <Text style={styles.label}>Length (metres)</Text>
      <TextInput
        style={styles.input}
        value={values.lengthM}
        onChangeText={setField('lengthM')}
        placeholder="16.5"
        placeholderTextColor={colors.textDim}
        keyboardType="decimal-pad"
        testID="profile-length-input"
      />
      {warnings.lengthM !== undefined && (
        <Text style={styles.warning} testID="profile-length-warning">
          {warnings.lengthM}
        </Text>
      )}

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
      minHeight: 64,
      backgroundColor: colors.accent,
      borderRadius: 32,
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
