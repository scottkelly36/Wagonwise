import type { ParkingFacility, SafeParkingSpotDto } from '@wagonwise/contracts/parking';
import { PARKING_FACILITIES } from '@wagonwise/contracts/parking';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useSuggestParkingSpotEdit } from '../api/use-parking';
import {
  buildSuggestion,
  FACILITY_WORDS,
  formFromSpot,
  nextFacility,
  type SuggestionForm,
} from '../lib/parking-suggestion';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';

interface Props {
  readonly spot: SafeParkingSpotDto;
  /** Back to the spot's details (after sending, or on "Back"). */
  readonly onDone: () => void;
}

const stateWord = (value: boolean | undefined): string =>
  value === undefined ? 'Not sure' : value ? 'Yes' : 'No';

/**
 * The form inside the parking drawer to suggest a change to a spot, or to say it is closed or gone. Only what the driver
 * changes is sent, and nothing on the map changes until WagonWise staff approve it. Says so before and after sending.
 */
export function ParkingSuggestForm({ spot, onDone }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const suggest = useSuggestParkingSpotEdit();
  const [form, setForm] = useState<SuggestionForm>(() => formFromSpot(spot));
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [sent, setSent] = useState(false);

  const send = (request: Parameters<typeof suggest.mutate>[0]['request']): void => {
    setProblem(undefined);
    suggest.mutate(
      { spotId: spot.id, request },
      {
        onSuccess: () => setSent(true),
        onError: () => setProblem("Couldn't send that. Check your signal and try again."),
      },
    );
  };

  if (sent) {
    return (
      <View style={styles.wrap} testID="parking-suggest-sent">
        <Text style={styles.title}>Thank you</Text>
        <Text style={styles.hint}>
          We will check it, and it will show on the map once approved. Drivers who come after you
          will be glad of it.
        </Text>
        <TouchableOpacity style={styles.primary} onPress={onDone} testID="parking-suggest-back">
          <Text style={styles.primaryText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const submit = (): void => {
    const built = buildSuggestion(spot, form);
    if (!built.ok) {
      setProblem(built.problem);
      return;
    }
    send(built.request);
  };

  return (
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Suggest a change</Text>
      <Text style={styles.hint}>
        Fix anything wrong or fill in what is missing. We check each one before it shows on the map.
      </Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={(name) => setForm({ ...form, name })}
        maxLength={120}
        placeholder="Name of the place"
        placeholderTextColor={colors.textDim}
        testID="suggest-name"
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
        testID="suggest-spaces"
      />

      <Text style={styles.label}>What is there (tap to change)</Text>
      <View style={styles.facilities}>
        {PARKING_FACILITIES.map((key: ParkingFacility) => {
          const value = form.facilities[key];
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.facility,
                value === true && styles.facilityYes,
                value === false && styles.facilityNo,
              ]}
              onPress={() =>
                setForm({ ...form, facilities: { ...form.facilities, [key]: nextFacility(value) } })
              }
              accessibilityRole="button"
              accessibilityLabel={`${FACILITY_WORDS[key]}: ${stateWord(value)}`}
              testID={`suggest-${key}`}
            >
              <Text style={styles.facilityName}>{FACILITY_WORDS[key]}</Text>
              <Text style={styles.facilityState}>{stateWord(value)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Tip for other drivers</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        value={form.note}
        onChangeText={(note) => setForm({ ...form, note })}
        maxLength={280}
        multiline
        placeholder="e.g. flat, room for a 44-tonner"
        placeholderTextColor={colors.textDim}
        testID="suggest-note"
      />

      {problem !== undefined && <Text style={styles.error}>{problem}</Text>}

      <TouchableOpacity
        style={[styles.primary, suggest.isPending && styles.disabled]}
        disabled={suggest.isPending}
        onPress={submit}
        testID="suggest-send"
      >
        {suggest.isPending ? (
          <ActivityIndicator color={colors.textOnAccent} />
        ) : (
          <Text style={styles.primaryText}>Send for checking</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.gone}
        disabled={suggest.isPending}
        onPress={() => send({ gone: true })}
        testID="suggest-gone"
      >
        <Text style={styles.goneText}>This place is closed or gone</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.back} onPress={onDone} testID="suggest-cancel">
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 12, paddingBottom: 8 },
    scroll: { maxHeight: 520 },
    title: { fontSize: 24, fontWeight: '700', color: colors.text },
    hint: { fontSize: 15, color: colors.textMuted, marginTop: 4 },
    label: { fontSize: 15, color: colors.textMuted, marginTop: 14 },
    input: {
      minHeight: 52,
      marginTop: 6,
      padding: 12,
      borderRadius: radius.badge,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 17,
    },
    noteInput: { minHeight: 76, textAlignVertical: 'top' },
    facilities: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    facility: {
      width: '48%',
      minHeight: 52,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.badge,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    facilityYes: { backgroundColor: colors.accentSoft },
    facilityNo: { opacity: 0.7 },
    facilityName: { fontSize: 15, fontWeight: '700', color: colors.text },
    facilityState: { fontSize: 13, color: colors.textMuted },
    error: { fontSize: 15, color: colors.danger, marginTop: 12 },
    primary: {
      marginTop: 18,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    primaryText: { fontSize: 18, fontWeight: '700', color: colors.textOnAccent },
    disabled: { opacity: 0.5 },
    gone: { marginTop: 10, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
    goneText: { fontSize: 16, fontWeight: '600', color: colors.danger },
    back: { minHeight: 48, justifyContent: 'center', alignItems: 'center' },
    backText: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  });
}
