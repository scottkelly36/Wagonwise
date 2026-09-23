import { useState } from 'react';
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
  parseVehicleProfileForm,
  type ParsedVehicleProfile,
  type VehicleProfileFormValues,
} from '../lib/vehicle-profile-form';

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
  const displayedError = validationError ?? errorMessage;

  return (
    <View style={styles.form}>
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={values.name}
        onChangeText={setField('name')}
        placeholder="e.g. The big wagon"
        placeholderTextColor="#6B7280"
        testID="profile-name-input"
      />

      <Text style={styles.label}>Height (metres)</Text>
      <TextInput
        style={styles.input}
        value={values.heightM}
        onChangeText={setField('heightM')}
        placeholder="4.2"
        placeholderTextColor="#6B7280"
        keyboardType="decimal-pad"
        testID="profile-height-input"
      />
      {heightPreview !== '' && <Text style={styles.hint}>{heightPreview}</Text>}

      <Text style={styles.label}>Width (metres)</Text>
      <TextInput
        style={styles.input}
        value={values.widthM}
        onChangeText={setField('widthM')}
        placeholder="2.6"
        placeholderTextColor="#6B7280"
        keyboardType="decimal-pad"
        testID="profile-width-input"
      />

      <Text style={styles.label}>Length (metres)</Text>
      <TextInput
        style={styles.input}
        value={values.lengthM}
        onChangeText={setField('lengthM')}
        placeholder="16.5"
        placeholderTextColor="#6B7280"
        keyboardType="decimal-pad"
        testID="profile-length-input"
      />

      <Text style={styles.label}>Gross weight (tonnes)</Text>
      <TextInput
        style={styles.input}
        value={values.grossWeightT}
        onChangeText={setField('grossWeightT')}
        placeholder="32"
        placeholderTextColor="#6B7280"
        keyboardType="decimal-pad"
        testID="profile-weight-input"
      />

      <Text style={styles.label}>Axle weight (tonnes, optional)</Text>
      <TextInput
        style={styles.input}
        value={values.axleWeightT}
        onChangeText={setField('axleWeightT')}
        placeholder="10"
        placeholderTextColor="#6B7280"
        keyboardType="decimal-pad"
        testID="profile-axle-weight-input"
      />

      {displayedError !== undefined && <Text style={styles.error}>{displayedError}</Text>}

      <TouchableOpacity
        style={[styles.button, pending && styles.buttonDisabled]}
        disabled={pending}
        onPress={handleSubmit}
        testID="profile-submit-button"
      >
        {pending ? (
          <ActivityIndicator color="#0B1220" />
        ) : (
          <Text style={styles.buttonText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 16,
  },
  input: {
    minHeight: 56,
    fontSize: 20,
    color: '#FFFFFF',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  hint: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  button: {
    minHeight: 56,
    backgroundColor: '#F5A623',
    borderRadius: 12,
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
    color: '#0B1220',
  },
  error: {
    fontSize: 16,
    color: '#F87171',
    marginTop: 12,
  },
});
