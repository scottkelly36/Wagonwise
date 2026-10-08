import { companyIdSchema } from '@wagonwise/contracts/companies';
import { savedPlaceIdSchema, type PlaceCategory } from '@wagonwise/contracts/places';
import * as Crypto from 'expo-crypto';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDeletePlace, useMarkPlace } from '../api/use-places';
import { fetchCurrentLocation } from '../hooks/use-current-location';
import { PLACE_CATEGORY_ICONS } from '../lib/place-icons';
import { defaultPlaceName, PLACE_CATEGORIES, PLACE_CATEGORY_LABELS } from '../lib/places';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { Icon } from './ui/icon';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** The stop being marked for, to name the place after it. */
  readonly stopName?: string | undefined;
  /** The company the place is shared with; absent for a personal one. */
  readonly companyId: string | undefined;
}

type Phase = { readonly kind: 'form' } | { readonly kind: 'saved'; readonly id: string };

/**
 * Marks the spot the driver is standing on: the real gate of a farm whose postcode lands elsewhere, a
 * customer's yard entrance. Name, a note for the next driver ("gate on the left, tight turn"), saved
 * where they are now. Shared with the company when they have one, otherwise personal. Right after
 * saving it can be taken back.
 */
export function MarkPlaceSheet(props: Props) {
  // Mounted only while open, so every opening starts a fresh form.
  return props.visible ? <MarkPlaceForm {...props} /> : null;
}

function MarkPlaceForm({ visible, onClose, stopName, companyId }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const mark = useMarkPlace();
  const remove = useDeletePlace();

  const [category, setCategory] = useState<PlaceCategory>('farm');
  const [name, setName] = useState(defaultPlaceName(stopName, 'farm'));
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [problem, setProblem] = useState<string | undefined>(undefined);

  async function save(): Promise<void> {
    setProblem(undefined);
    const here = await fetchCurrentLocation();
    if (!here.ok) {
      setProblem('We can’t find where you are. Turn on location and try again.');
      return;
    }
    const id = savedPlaceIdSchema.parse(Crypto.randomUUID());
    mark.mutate(
      {
        id,
        ...(companyId === undefined ? {} : { companyId: companyIdSchema.parse(companyId) }),
        category,
        name: name.trim() === '' ? defaultPlaceName(stopName, category) : name.trim(),
        ...(note.trim() === '' ? {} : { note: note.trim() }),
        location: here.point,
      },
      {
        onSuccess: () => setPhase({ kind: 'saved', id }),
        onError: () => setProblem('Couldn’t save that. Check your signal and try again.'),
      },
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
          <View style={styles.handle} />
          {phase.kind === 'saved' ? (
            <>
              <View style={styles.savedRow}>
                <Icon name="check-circle" size={34} color={colors.accent} />
                <Text style={styles.title}>Marked here</Text>
              </View>
              <Text style={styles.body}>
                {companyId === undefined
                  ? 'Saved for you. It will show on your map.'
                  : 'Saved for your company. Every driver will see it for future jobs.'}
              </Text>
              <View style={styles.row}>
                <TouchableOpacity
                  style={[styles.secondary, remove.isPending && styles.disabled]}
                  disabled={remove.isPending}
                  onPress={() => remove.mutate(phase.id, { onSuccess: onClose })}
                  testID="mark-place-undo"
                >
                  <Text style={styles.secondaryText}>Undo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primary} onPress={onClose} testID="mark-place-done">
                  <Text style={styles.primaryText}>Done</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>Mark this spot</Text>
              <Text style={styles.body}>
                Stand at the gate or entrance. It is saved exactly where you are now.{' '}
                {companyId === undefined
                  ? 'Only you will see it.'
                  : 'Your whole company will see it.'}
              </Text>

              <View style={styles.chips}>
                {PLACE_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, c === category && styles.chipOn]}
                    onPress={() => setCategory(c)}
                    testID={`mark-place-category-${c}`}
                  >
                    <Icon
                      name={PLACE_CATEGORY_ICONS[c]}
                      size={20}
                      color={c === category ? colors.textOnAccent : colors.text}
                    />
                    <Text style={[styles.chipText, c === category && styles.chipTextOn]}>
                      {PLACE_CATEGORY_LABELS[c]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Smith’s Farm"
                placeholderTextColor={colors.textDim}
                maxLength={80}
                testID="mark-place-name"
              />
              <Text style={styles.label}>Note for the next driver (optional)</Text>
              <TextInput
                style={[styles.input, styles.noteInput]}
                value={note}
                onChangeText={setNote}
                placeholder="Gate on the left, tight turn, ask for Jim"
                placeholderTextColor={colors.textDim}
                multiline
                maxLength={500}
                testID="mark-place-note"
              />

              {problem !== undefined && <Text style={styles.error}>{problem}</Text>}

              <View style={styles.row}>
                <TouchableOpacity style={styles.secondary} onPress={onClose}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primary, mark.isPending && styles.disabled]}
                  disabled={mark.isPending}
                  onPress={() => void save()}
                  testID="mark-place-save"
                >
                  {mark.isPending ? (
                    <ActivityIndicator color={colors.textOnAccent} />
                  ) : (
                    <Text style={styles.primaryText}>Save here</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: 'flex-end' },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
      paddingHorizontal: 20,
      paddingTop: 12,
      maxHeight: '90%',
      gap: 6,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceStrong,
      marginBottom: 12,
    },
    savedRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 24, fontWeight: '700', color: colors.text },
    body: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
    chips: { flexDirection: 'row', gap: 8, marginTop: 14 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    chipOn: { backgroundColor: colors.accent },
    chipText: { fontSize: 16, fontWeight: '600', color: colors.text },
    chipTextOn: { color: colors.textOnAccent },
    label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginTop: 14 },
    input: {
      marginTop: 6,
      borderRadius: 14,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 17,
      color: colors.text,
    },
    noteInput: { minHeight: 84, textAlignVertical: 'top' },
    error: { fontSize: 15, color: colors.danger, marginTop: 10 },
    row: { flexDirection: 'row', gap: 12, marginTop: 20 },
    primary: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    primaryText: { fontSize: 18, fontWeight: '700', color: colors.textOnAccent },
    secondary: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.textDim,
      justifyContent: 'center',
      alignItems: 'center',
    },
    secondaryText: { fontSize: 18, fontWeight: '700', color: colors.text },
    disabled: { opacity: 0.5 },
  });
}
