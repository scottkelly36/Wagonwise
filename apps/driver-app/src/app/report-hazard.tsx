import { hazardReportIdSchema } from '@wagonwise/contracts/hazards';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useReportHazard } from '../api/use-hazards';
import { RouteMap, type MapPoint } from '../components/route-map';
import { useCurrentLocation } from '../hooks/use-current-location';
import { hazardsErrorMessage } from '../lib/error-messages';
import { HAZARD_TYPE_LABELS, measurementKindFor, measurementLabelFor } from '../lib/hazard-labels';
import { parseHazardReportForm } from '../lib/hazard-report-form';

const HAZARD_TYPES = Object.keys(HAZARD_TYPE_LABELS) as (keyof typeof HAZARD_TYPE_LABELS)[];

/**
 * Report hazard (tap) — design doc §8: "Type picker, optional note/measurement, drop pin —
 * parked use". Voice reporting (the primary while-driving path) is M7; this screen is
 * deliberately the tap-only, parked-use half of the design doc's hands-free principle.
 */
export default function ReportHazardScreen() {
  const router = useRouter();
  const location = useCurrentLocation();
  const reportHazard = useReportHazard();

  const [type, setType] = useState<keyof typeof HAZARD_TYPE_LABELS | undefined>(undefined);
  const [pin, setPin] = useState<MapPoint | undefined>(undefined);
  const [note, setNote] = useState('');
  const [measurementValue, setMeasurementValue] = useState('');
  const [validationError, setValidationError] = useState<string | undefined>(undefined);

  // Defaults to current location (same "default until overridden" pattern as plan-route's
  // origin, M5.4) — the hazard is very likely right where the driver is, but a tap still moves
  // the pin precisely.
  const effectivePin = pin ?? location.point;
  const measurementKind = type === undefined ? undefined : measurementKindFor(type);

  function handleSubmit(): void {
    setValidationError(undefined);
    const result = parseHazardReportForm({
      type,
      location: effectivePin,
      note,
      measurementValue,
    });
    if (!result.ok) {
      setValidationError(result.message);
      return;
    }
    reportHazard.mutate(
      { id: hazardReportIdSchema.parse(Crypto.randomUUID()), source: 'tap', ...result.value },
      { onSuccess: (report) => router.replace(`/hazards/${report.id}`) },
    );
  }

  const displayedError =
    validationError ?? (reportHazard.isError ? hazardsErrorMessage(reportHazard.error) : undefined);

  return (
    <SafeAreaView style={styles.container}>
      <RouteMap
        origin={pin}
        destination={undefined}
        onMapPress={setPin}
        currentPosition={location.point}
      />

      <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
        <Text style={styles.title}>Report a hazard</Text>
        <Text style={styles.hint}>Tap the map to drop a pin where it is.</Text>

        <View style={styles.typeGrid}>
          {HAZARD_TYPES.map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.chip, type === value && styles.chipSelected]}
              onPress={() => setType(value)}
              testID={`hazard-type-${value}`}
            >
              <Text style={[styles.chipText, type === value && styles.chipTextSelected]}>
                {HAZARD_TYPE_LABELS[value]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {measurementKind !== undefined && (
          <>
            <Text style={styles.label}>{measurementLabelFor(measurementKind)}</Text>
            <TextInput
              style={styles.input}
              value={measurementValue}
              onChangeText={setMeasurementValue}
              placeholder="e.g. 3.5"
              placeholderTextColor="#6B7280"
              keyboardType="decimal-pad"
              testID="hazard-measurement-input"
            />
          </>
        )}

        <Text style={styles.label}>Note (optional)</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          placeholder="Anything else worth knowing"
          placeholderTextColor="#6B7280"
          multiline
          testID="hazard-note-input"
        />

        {displayedError !== undefined && <Text style={styles.error}>{displayedError}</Text>}

        <TouchableOpacity
          style={[styles.button, reportHazard.isPending && styles.buttonDisabled]}
          disabled={reportHazard.isPending}
          onPress={handleSubmit}
          testID="report-hazard-submit-button"
        >
          {reportHazard.isPending ? (
            <ActivityIndicator color="#0B1220" />
          ) : (
            <Text style={styles.buttonText}>Report hazard</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  panel: {
    maxHeight: '55%',
  },
  panelContent: {
    padding: 16,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 56,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1F2937',
  },
  chipSelected: {
    backgroundColor: '#F5A623',
  },
  chipText: {
    fontSize: 16,
    color: '#E5E7EB',
  },
  chipTextSelected: {
    color: '#0B1220',
    fontWeight: '700',
  },
  label: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 16,
  },
  input: {
    minHeight: 56,
    fontSize: 18,
    color: '#FFFFFF',
    backgroundColor: '#1F2937',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  noteInput: {
    minHeight: 80,
    paddingTop: 16,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 16,
    color: '#F87171',
    marginTop: 16,
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
});
