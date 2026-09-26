import { congestionReportIdSchema } from '@wagonwise/contracts/congestion';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useReportCongestion } from '../api/use-congestion';
import { RouteMap, type MapPoint } from '../components/route-map';
import { useCurrentLocation } from '../hooks/use-current-location';
import { useThemeColors, type ThemeColors } from '../theme/colors';

// A handful of presets rather than a free-text field — a driver reporting this while stopped in
// traffic wants one tap, not a keyboard (same hands-free-first spirit as hazards' voice reporting,
// design doc §7, even though this particular flow is still tap-only in Phase 1).
const WAIT_MINUTES_PRESETS = [5, 15, 30, 60] as const;

/** Report traffic (Phase 1, crowd-sourced congestion tracking, docs/progress.md) — tap the map to
 *  drop a pin, pick how long the wait looks like, done. Deliberately simpler than
 *  report-hazard.tsx: no type picker, no note, no offline queue — a stale congestion report just
 *  expires on its own (`estimatedWaitMinutes`), so there's no need to guarantee delivery the way
 *  a persistent hazard report does. */
export default function ReportCongestionScreen() {
  const router = useRouter();
  const location = useCurrentLocation();
  const reportCongestion = useReportCongestion();

  const [pin, setPin] = useState<MapPoint | undefined>(undefined);
  const [estimatedWaitMinutes, setEstimatedWaitMinutes] = useState<number | undefined>(undefined);
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Defaults to current location, same "default until overridden" pattern as report-hazard.tsx.
  const effectivePin = pin ?? location.point;

  async function handleSubmit(): Promise<void> {
    setValidationError(undefined);
    if (effectivePin === undefined) {
      setValidationError("Couldn't determine a location. Tap the map to drop a pin.");
      return;
    }
    if (estimatedWaitMinutes === undefined) {
      setValidationError('Pick how long the wait looks like.');
      return;
    }

    reportCongestion.mutate(
      {
        id: congestionReportIdSchema.parse(Crypto.randomUUID()),
        location: effectivePin,
        estimatedWaitMinutes,
      },
      {
        onSuccess: () => router.back(),
        onError: () => setValidationError("Couldn't send this report. Try again."),
      },
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <RouteMap
          origin={pin}
          destination={undefined}
          onMapPress={setPin}
          currentPosition={location.point}
        />

        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <Text style={styles.title}>Report traffic</Text>
          <Text style={styles.hint}>Tap the map to drop a pin where it is.</Text>

          <Text style={styles.label}>How long&apos;s the wait?</Text>
          <View style={styles.chipRow}>
            {WAIT_MINUTES_PRESETS.map((minutes) => (
              <TouchableOpacity
                key={minutes}
                style={[styles.chip, estimatedWaitMinutes === minutes && styles.chipSelected]}
                onPress={() => setEstimatedWaitMinutes(minutes)}
                testID={`congestion-wait-${minutes}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    estimatedWaitMinutes === minutes && styles.chipTextSelected,
                  ]}
                >
                  {minutes} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {validationError !== undefined && <Text style={styles.error}>{validationError}</Text>}

          <TouchableOpacity
            style={[styles.button, reportCongestion.isPending && styles.buttonDisabled]}
            disabled={reportCongestion.isPending}
            onPress={() => void handleSubmit()}
            testID="report-congestion-submit-button"
          >
            {reportCongestion.isPending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>Report traffic</Text>
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
    label: {
      fontSize: 16,
      color: colors.textMuted,
      marginTop: 16,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 8,
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
