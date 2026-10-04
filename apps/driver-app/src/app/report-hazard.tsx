import { hazardReportIdSchema } from '@wagonwise/contracts/hazards';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useReportHazard } from '../api/use-hazards';
import { RouteMap, type MapPoint } from '../components/route-map';
import { enqueueHazardReport, removeQueuedHazardReport } from '../db/hazard-queue';
import { useCurrentLocation } from '../hooks/use-current-location';
import { HAZARD_TYPE_LABELS, measurementKindFor, measurementLabelFor } from '../lib/hazard-labels';
import { parseHazardReportForm } from '../lib/hazard-report-form';
import { useThemeColors, type ThemeColors } from '../theme/colors';

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
  const [queued, setQueued] = useState(false);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Defaults to current location (same "default until overridden" pattern as plan-route's
  // origin, M5.4) — the hazard is very likely right where the driver is, but a tap still moves
  // the pin precisely.
  const effectivePin = pin ?? location.point;
  const measurementKind = type === undefined ? undefined : measurementKindFor(type);

  async function handleSubmit(): Promise<void> {
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

    // Stored locally first, before ever touching the network (design doc §5) — a report a
    // driver just made is never lost to a dropped connection, even if the immediate send below
    // fails.
    const request = {
      id: hazardReportIdSchema.parse(Crypto.randomUUID()),
      source: 'tap' as const,
      ...result.value,
    };
    try {
      await enqueueHazardReport(request);
    } catch {
      setValidationError("Couldn't save this report. Try again.");
      return;
    }

    reportHazard.mutate(request, {
      onSuccess: async (report) => {
        await removeQueuedHazardReport(request.id);
        router.replace(`/hazards/${report.id}`);
      },
      // Left in the local queue — useHazardQueueFlush (wired into _layout.tsx) retries
      // automatically once the app's next online, so this isn't an error state.
      onError: () => setQueued(true),
    });
  }

  if (queued) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.queuedContent}>
          <Text style={styles.title}>Saved</Text>
          <Text style={[styles.hint, styles.queuedHint]}>
            You’re offline right now — this will be sent automatically once you’re back online.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.back()}
            testID="queued-done-button"
          >
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        // The map (flex: 1, above the panel) shrinks when the keyboard appears rather than the
        // panel getting covered (design decision, 2026-09-24: "the keypad covers the form") —
        // same reasoning and same fix as plan-route.tsx.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
                placeholderTextColor={colors.textDim}
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
            placeholderTextColor={colors.textDim}
            multiline
            testID="hazard-note-input"
          />

          {validationError !== undefined && <Text style={styles.error}>{validationError}</Text>}

          <TouchableOpacity
            style={[styles.button, reportHazard.isPending && styles.buttonDisabled]}
            disabled={reportHazard.isPending}
            onPress={() => void handleSubmit()}
            testID="report-hazard-submit-button"
          >
            {reportHazard.isPending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>Report hazard</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    queuedContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
      gap: 12,
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
      color: colors.text,
    },
    hint: {
      fontSize: 14,
      color: colors.textMuted,
      marginBottom: 8,
    },
    queuedHint: {
      textAlign: 'center',
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
      backgroundColor: colors.surface,
    },
    chipSelected: {
      backgroundColor: colors.accent,
    },
    chipText: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    chipTextSelected: {
      color: colors.textOnAccent,
      fontWeight: '700',
    },
    label: {
      fontSize: 16,
      color: colors.textMuted,
      marginTop: 16,
    },
    input: {
      minHeight: 56,
      fontSize: 18,
      color: colors.text,
      backgroundColor: colors.surface,
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
      color: colors.danger,
      marginTop: 16,
    },
    button: {
      minHeight: 56,
      backgroundColor: colors.accent,
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
      color: colors.textOnAccent,
    },
  });
}
