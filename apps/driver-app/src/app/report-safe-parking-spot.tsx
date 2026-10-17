import { safeParkingSpotIdSchema } from '@wagonwise/contracts/parking';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useReportSafeParkingSpot } from '../api/use-parking';
import { ParkingFacilityGrid } from '../components/parking-facility-grid';
import { RouteMap, type MapPoint } from '../components/route-map';
import { useCurrentLocation } from '../hooks/use-current-location';
import { buildNewSpotDetails, emptyForm } from '../lib/parking-suggestion';
import { Icon } from '../components/ui/icon';
import { MapSheet } from '../components/ui/map-sheet';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';

const NOTE_MAX_LENGTH = 280;

/** Report a safe place to park an HGV (layby, truck stop) — M9, docs/progress.md. Tap the map to
 *  drop a pin, add an optional note, done; "Add details" opens the name, number of HGV spaces and what is there (all optional,
 *  closed by default so the quick path stays quick). Deliberately simple, same spirit as
 *  report-congestion.tsx: no offline queue — a persistent point of interest with no expiry (M9's
 *  own scoping) doesn't need the delivery guarantee a hazard report does, but a dropped
 *  connection is still just "try again", not silently lost. */
export default function ReportSafeParkingSpotScreen() {
  const router = useRouter();
  const location = useCurrentLocation();
  const reportSpot = useReportSafeParkingSpot();

  const [pin, setPin] = useState<MapPoint | undefined>(undefined);
  const [note, setNote] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [showDetails, setShowDetails] = useState(false);
  const [mergedWithDetails, setMergedWithDetails] = useState(false);
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

    const built = buildNewSpotDetails(form);
    if (!built.ok) {
      setValidationError(built.problem);
      return;
    }
    const id = safeParkingSpotIdSchema.parse(Crypto.randomUUID());
    reportSpot.mutate(
      {
        id,
        location: effectivePin,
        note: note.trim() === '' ? undefined : note.trim(),
        ...built.details,
      },
      {
        onSuccess: (spot) => {
          // A place already on the map keeps what it says; the details wait for us to check them.
          if (spot.id !== id && Object.keys(built.details).length > 0) {
            setMergedWithDetails(true);
            return;
          }
          router.back();
        },
        onError: () => setValidationError("Couldn't send this report. Try again."),
      },
    );
  }

  return (
    <MapSheet
      map={
        <RouteMap
          origin={pin}
          destination={undefined}
          onMapPress={setPin}
          currentPosition={location.point}
        />
      }
    >
      <View style={styles.titleRow}>
        <Icon name="parking" size={34} color="#1A73E8" />
        <Text style={styles.title}>Mark safe parking</Text>
      </View>
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

      <TouchableOpacity
        style={styles.moreLink}
        onPress={() => setShowDetails((open) => !open)}
        accessibilityRole="button"
        testID="parking-details-toggle"
      >
        <Text style={styles.moreText}>
          {showDetails ? 'Hide details' : 'Add details: name, spaces, what is there (optional)'}
        </Text>
      </TouchableOpacity>

      {showDetails && (
        <View testID="parking-details">
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={(name) => setForm({ ...form, name })}
            maxLength={120}
            placeholder="Name of the place"
            placeholderTextColor={colors.textDim}
            testID="parking-name-input"
          />

          <Text style={styles.label}>How many HGVs can park</Text>
          <TextInput
            style={styles.input}
            value={form.spaces}
            onChangeText={(spaces) => setForm({ ...form, spaces })}
            keyboardType="number-pad"
            maxLength={4}
            placeholder="Number of HGV spaces"
            placeholderTextColor={colors.textDim}
            testID="parking-spaces-input"
          />

          <Text style={styles.label}>What is there (tap to change)</Text>
          <ParkingFacilityGrid
            value={form.facilities}
            onChange={(facilities) => setForm({ ...form, facilities })}
            testIdPrefix="report"
          />
        </View>
      )}

      {validationError !== undefined && <Text style={styles.error}>{validationError}</Text>}

      {mergedWithDetails && (
        <View testID="parking-merged">
          <Text style={styles.hint}>
            Thanks. That place is already on the map, so we will check your details before they
            show.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {!mergedWithDetails && (
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
      )}
    </MapSheet>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    title: {
      fontSize: 26,
      fontWeight: '800',
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
      borderRadius: radius.badge,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 16,
      textAlignVertical: 'top',
    },
    moreLink: { marginTop: 16, minHeight: 44, justifyContent: 'center' },
    moreText: { fontSize: 15, fontWeight: '600', color: colors.accent },
    error: {
      fontSize: 16,
      color: colors.danger,
      marginTop: 16,
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
  });
}
