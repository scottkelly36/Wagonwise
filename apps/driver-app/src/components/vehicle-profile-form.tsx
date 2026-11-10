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
import { VehiclePresetPicker } from './vehicle-preset-picker';
import { MpgInput } from './mpg-input';
import { SpeedInput } from './speed-input';
import { SegmentedControl } from './ui/segmented-control';
import { FUEL_UNIT_OPTIONS, formatHeightWithFeetInches, type LengthUnit } from '../lib/units';
import {
  VEHICLE_PRESETS,
  presetFormValues,
  presetMatching,
  type VehiclePreset,
} from '../lib/vehicle-presets';
import { useLengthUnitStore } from '../state/length-unit-store';
import { useMeasureUnitsStore } from '../state/measure-units-store';
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
  /** Which way the size is given when the form opens: typed (the default) or picked from the presets. */
  readonly initialMode?: SizeMode;
  /** Called after a preset is picked, so a screen can take the driver down to the button. */
  readonly onPresetPicked?: () => void;
}

/** How the size is given: picked from the typical sizes, or typed in metres or in feet and inches. */
type SizeMode = 'presets' | 'type';

const EURO_VI_OPTIONS = [
  { key: 'yes', label: 'Yes' },
  { key: 'no', label: 'No' },
  { key: 'unknown', label: "Don't know" },
] as const;

const SIZE_OPTIONS: readonly { key: 'presets' | LengthUnit; label: string }[] = [
  { key: 'presets', label: 'Presets' },
  { key: 'metres', label: 'Metres' },
  { key: 'feet', label: 'Feet & inches' },
];

export function VehicleProfileForm({
  initialValues,
  submitLabel,
  pending,
  errorMessage,
  onSubmit,
  initialMode = 'type',
  onPresetPicked,
}: Props) {
  const [values, setValues] = useState(initialValues);
  const [mode, setMode] = useState<SizeMode>(initialMode);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const unit = useLengthUnitStore((s) => s.unit);
  const setUnit = useLengthUnitStore((s) => s.setUnit);
  const fuelUnit = useMeasureUnitsStore((s) => s.fuel);
  const setFuelUnit = useMeasureUnitsStore((s) => s.setFuel);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  function setField(field: keyof VehicleProfileFormValues) {
    return (text: string) => {
      setValidationError(undefined);
      setValues((current) => ({ ...current, [field]: text }));
    };
  }

  /** A preset fills the sizes and weight and names the vehicle, unless the driver has already given it a name of their own. */
  function pickPreset(preset: VehiclePreset): void {
    setValidationError(undefined);
    setValues((current) => {
      const filled = presetFormValues(preset);
      const keepName =
        current.name.trim() !== '' && !VEHICLE_PRESETS.some((p) => p.name === current.name);
      return {
        ...filled,
        name: keepName ? current.name : filled.name,
        fuelConsumptionL100km: current.fuelConsumptionL100km,
        topSpeedKph: current.topSpeedKph,
        euroVI: current.euroVI,
      };
    });
    onPresetPicked?.();
  }

  function handleSizeChoice(next: 'presets' | LengthUnit): void {
    setValidationError(undefined);
    if (next === 'presets') {
      setMode('presets');
      return;
    }
    setMode('type');
    void setUnit(next);
  }

  const chosenPreset = presetMatching(values);
  const sizesGiven = values.heightM.trim() !== '' || values.widthM.trim() !== '';

  function handleSubmit() {
    if (mode === 'presets' && !sizesGiven) {
      setValidationError('Pick the nearest match, or switch to Metres to type your own.');
      return;
    }
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

      <Text style={styles.label}>Vehicle size</Text>
      <SegmentedControl
        options={SIZE_OPTIONS}
        value={mode === 'presets' ? 'presets' : unit}
        onChange={handleSizeChoice}
        testIDPrefix="profile-unit"
      />

      {mode === 'presets' ? (
        <>
          <VehiclePresetPicker selectedId={chosenPreset?.id} onPick={pickPreset} />
          {sizesGiven && chosenPreset === undefined && (
            <Text style={styles.hint} testID="profile-own-sizes-note">
              Using your own sizes. Switch to Metres or Feet and inches to see or change them.
            </Text>
          )}
          <Text style={styles.hint}>
            For an axle weight or fuel economy, switch to Metres or Feet and inches.
          </Text>
        </>
      ) : (
        <>
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

          <Text style={styles.label}>Fuel economy (optional)</Text>
          <SegmentedControl
            options={FUEL_UNIT_OPTIONS}
            value={fuelUnit}
            onChange={(next) => void setFuelUnit(next)}
            testIDPrefix="profile-fuel-unit"
          />
          {fuelUnit === 'mpg' ? (
            // Remounted when the unit changes, so the box is filled afresh from the value in litres per 100 km.
            <MpgInput
              key={fuelUnit}
              l100km={values.fuelConsumptionL100km}
              onChangeL100km={setField('fuelConsumptionL100km')}
              placeholder="9.4"
              inputStyle={styles.input}
              testID="profile-fuel-consumption-mpg-input"
            />
          ) : (
            <TextInput
              style={styles.input}
              value={values.fuelConsumptionL100km}
              onChangeText={setField('fuelConsumptionL100km')}
              placeholder="30"
              placeholderTextColor={colors.textDim}
              keyboardType="decimal-pad"
              testID="profile-fuel-consumption-input"
            />
          )}
          <Text style={styles.hint}>
            Used only for a rough fuel-cost estimate on route options.
          </Text>
        </>
      )}

      {/* Outside the two size modes: a driver who picked a preset still needs to set the speed their limiter is set to. */}
      <Text style={styles.label}>Top speed (mph, optional)</Text>
      <SpeedInput
        kph={values.topSpeedKph}
        onChangeKph={setField('topSpeedKph')}
        placeholder="56"
        inputStyle={styles.input}
        testID="profile-top-speed-input"
      />
      {warnings.topSpeedKph !== undefined && (
        <Text style={styles.warning} testID="profile-top-speed-warning">
          {warnings.topSpeedKph}
        </Text>
      )}
      <Text style={styles.hint}>
        The speed arrival times are worked out at, such as your speed limiter. Leave it blank for 55
        mph. It changes how long a route takes, not which road is chosen.
      </Text>

      <Text style={styles.label}>Euro VI engine (optional)</Text>
      <SegmentedControl
        options={EURO_VI_OPTIONS}
        value={values.euroVI === 'yes' || values.euroVI === 'no' ? values.euroVI : 'unknown'}
        onChange={(next) => setField('euroVI')(next === 'unknown' ? '' : next)}
        testIDPrefix="profile-euro-vi"
      />
      <Text style={styles.hint}>
        For the low emission and clean air zone warnings. Most lorries registered in the last ten
        years or so are Euro VI. If you are not sure, leave it on Don't know.
      </Text>

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
