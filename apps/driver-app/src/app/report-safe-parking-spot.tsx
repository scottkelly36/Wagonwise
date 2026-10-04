import { safeParkingSpotIdSchema } from '@wagonwise/contracts/parking';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useReportSafeParkingSpot } from '../api/use-parking';
import { RouteMap, type MapPoint } from '../components/route-map';
import { useCurrentLocation } from '../hooks/use-current-location';
import { useThemeColors, type ThemeColors } from '../theme/colors';

const NOTE_MAX_LENGTH = 280;

/** Report a safe place to park an HGV (layby, truck stop) — M9, docs/progress.md. Tap the map to
 *  drop a pin, add an optional note, done. Deliberately simple, same spirit as
 *  report-congestion.tsx: no offline queue — a persistent point of interest with no expiry (M9's
 *  own scoping) doesn't need the delivery guarantee a hazard report does, but a dropped
 *  connection is still just "try again", not silently lost. */
export default function ReportSafeParkingSpotScreen() {
  const router = useRouter();
  const location = useCurrentLocation();
  const reportSpot = useReportSafeParkingSpot();

  const [pin, setPin] = useState<MapPoint | undefined>(undefined);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | undefined>(undefined);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Defaults to current location, same "default until overridden" pattern as report-congestion.tsx.
  const effectivePin = pin ?? location.point;

  async function handleSubmit(): Promise<void> {
    setValidationError(undefined);
    if (effectivePin === undefined) {
      setValidationError("Couldn't determine a location. Tap the map to drop a pin.");
      return;
    }

    reportSpot.mutate(
      {
        id: safeParkingSpotIdSchema.parse(Crypto.randomUUID()),
        location: effectivePin,
        note: note.trim() === '' ? undefined : note.trim(),
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
          <Text style={styles.title}>Mark safe parking</Text>
          <Text style={styles.hint}>Tap the map to drop a pin where it is.</Text>

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={styles.input}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. flat layby, room for a 44-tonner"
            placeholderTextColor={colors.textDim}
            maxLength={NOTE_MAX_LENGTH}
            multiline
            testID="parking-note-input"
          />

          {validationError !== undefined && <Text style={styles.error}>{validationError}</Text>}

          <TouchableOpacity
            style={[styles.button, reportSpot.isPending && styles.buttonDisabled]}
            disabled={reportSpot.isPending}
            onPress={() => void handleSubmit()}
            testID="report-parking-spot-submit-button"
          >
            {reportSpot.isPending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>Mark parking spot</Text>
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
    input: {
      minHeight: 56,
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 16,
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
