import type { SavedPlaceDto } from '@wagonwise/contracts/places';
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

import { ApiError } from '../api/errors';
import {
  useDeletePlace,
  useMyPlaces,
  useReportPlace,
  useSetPlaceVisibility,
  useSharePlace,
  useUpdatePlace,
} from '../api/use-places';
import { PLACE_CATEGORY_ICONS } from '../lib/place-icons';
import { PLACE_CATEGORY_LABELS, PLACE_REPORT_REASONS } from '../lib/places';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { Icon } from './ui/icon';

interface Props {
  readonly place: SavedPlaceDto | undefined;
  readonly onClose: () => void;
  /** Takes the driver there. Absent hides the button (no vehicle profile to plan with). */
  readonly onGo?: ((place: SavedPlaceDto) => void) | undefined;
  readonly goDisabled?: boolean;
  /** The company a personal place could be shared with: the driver's company now, if they have one. */
  readonly shareCompanyId?: string | undefined;
}

/**
 * A saved place's details as a bottom sheet (an ordinary Modal, outside the map's view tree, like the
 * hazard and parking drawers): what it is, where, and the note, which any driver of the company can
 * improve; a button to go there; and delete, which core allows only for whoever marked it or dispatch.
 * A driver's own personal place can be made public (every WagonWise driver sees it, never who marked it) and back; a public place
 * someone else shared is read-only here, with a way to report it.
 */
export function PlaceSheet(props: Props) {
  // Mounted only while a place is chosen, and fresh for each (and after its note is saved), so the
  // note box always starts from what is stored.
  const { place } = props;
  return place === undefined ? null : (
    <PlaceSheetBody key={`${place.id}:${place.updatedAt}`} {...props} />
  );
}

function PlaceSheetBody({ place, onClose, onGo, goDisabled = false, shareCompanyId }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const update = useUpdatePlace();
  const remove = useDeletePlace();
  const share = useSharePlace();
  const visibility = useSetPlaceVisibility();
  const reportPlace = useReportPlace();
  // A place the driver cannot find among their own is another driver's public one: theirs to read, report and go to, not to change.
  const mine = useMyPlaces().places.some((p) => p.id === place?.id);
  const [confirmingPublic, setConfirmingPublic] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const savedNote = place?.note ?? '';
  const [note, setNote] = useState(savedNote);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const changed = note.trim() !== savedNote;

  return (
    <Modal visible={place !== undefined} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
          <View style={styles.handle} />
          {place !== undefined && (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.titleRow}>
                <View style={styles.badge}>
                  <Icon
                    name={PLACE_CATEGORY_ICONS[place.category]}
                    size={30}
                    color={colors.accent}
                  />
                </View>
                <View style={styles.titleText}>
                  <Text style={styles.title}>{place.name}</Text>
                  <Text style={styles.status}>
                    {PLACE_CATEGORY_LABELS[place.category]} ·{' '}
                    {!mine
                      ? 'shared by a WagonWise driver'
                      : place.companyId !== undefined
                        ? 'shared with your company'
                        : place.isPublic
                          ? 'public: every WagonWise driver can see it'
                          : 'only you'}
                  </Text>
                </View>
              </View>

              <Text style={styles.label}>Note</Text>
              {!mine && (
                <Text style={styles.readNote} testID="place-note-readonly">
                  {savedNote.length > 0 ? savedNote : 'No note.'}
                </Text>
              )}
              {mine && (
                <TextInput
                  style={styles.input}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Gate on the left, tight turn, ask for Jim"
                  placeholderTextColor={colors.textDim}
                  multiline
                  maxLength={500}
                  testID="place-note-input"
                />
              )}
              {mine && changed && (
                <TouchableOpacity
                  style={[styles.saveNote, update.isPending && styles.disabled]}
                  disabled={update.isPending}
                  onPress={() =>
                    update.mutate(
                      { id: place.id, note: note.trim() },
                      { onError: () => setProblem('Couldn’t save the note. Try again.') },
                    )
                  }
                  testID="place-note-save"
                >
                  {update.isPending ? (
                    <ActivityIndicator color={colors.textOnAccent} />
                  ) : (
                    <Text style={styles.saveNoteText}>Save note</Text>
                  )}
                </TouchableOpacity>
              )}

              {problem !== undefined && <Text style={styles.error}>{problem}</Text>}

              {mine && place.companyId === undefined && (
                <View style={styles.shareBox}>
                  {place.isPublic ? (
                    <>
                      <Text style={styles.shareText}>
                        Every WagonWise driver can see this place and its note. Your name is never
                        shown with it.
                      </Text>
                      <TouchableOpacity
                        style={[styles.share, visibility.isPending && styles.disabled]}
                        disabled={visibility.isPending}
                        onPress={() =>
                          visibility.mutate(
                            { id: place.id, isPublic: false },
                            { onError: () => setProblem('Couldn’t make it private. Try again.') },
                          )
                        }
                        testID="place-make-private-button"
                      >
                        <Text style={styles.shareButtonText}>Make private again</Text>
                      </TouchableOpacity>
                    </>
                  ) : confirmingPublic ? (
                    <>
                      <Text style={styles.shareText}>
                        Every WagonWise driver will see this place and its note, and it may be used
                        by drivers you will never meet. Your name is never shown. Don’t put phone
                        numbers, names or a home address in the note, and don’t share someone’s
                        private land without their say-so.
                      </Text>
                      <TouchableOpacity
                        style={[styles.share, visibility.isPending && styles.disabled]}
                        disabled={visibility.isPending}
                        onPress={() =>
                          visibility.mutate(
                            { id: place.id, isPublic: true },
                            {
                              onSuccess: () => setConfirmingPublic(false),
                              onError: () => setProblem('Couldn’t share it. Try again.'),
                            },
                          )
                        }
                        testID="place-make-public-confirm"
                      >
                        <Text style={styles.shareButtonText}>Yes, share with all drivers</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.linkButton}
                        onPress={() => setConfirmingPublic(false)}
                      >
                        <Text style={styles.linkButtonText}>Not now</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <Text style={styles.shareText}>
                        Only you can see this. Share it so other drivers can find the right gate
                        too.
                      </Text>
                      <TouchableOpacity
                        style={styles.share}
                        onPress={() => setConfirmingPublic(true)}
                        testID="place-make-public-button"
                      >
                        <Text style={styles.shareButtonText}>Share with all drivers</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              {mine && place.companyId === undefined && shareCompanyId !== undefined && (
                <View style={styles.shareBox}>
                  <Text style={styles.shareText}>
                    This one is only yours. Share it so every driver at your company sees it too.
                  </Text>
                  <TouchableOpacity
                    style={[styles.share, share.isPending && styles.disabled]}
                    disabled={share.isPending}
                    onPress={() =>
                      share.mutate(
                        { id: place.id, companyId: shareCompanyId },
                        {
                          onSuccess: onClose,
                          onError: () => setProblem('Couldn’t share it. Try again.'),
                        },
                      )
                    }
                    testID="place-share-button"
                  >
                    <Text style={styles.shareButtonText}>Share with my company</Text>
                  </TouchableOpacity>
                </View>
              )}

              {onGo !== undefined && (
                <TouchableOpacity
                  style={[styles.go, goDisabled && styles.disabled]}
                  disabled={goDisabled}
                  onPress={() => onGo(place)}
                  testID="place-go-button"
                >
                  <Icon name="navigation-variant" size={22} color={colors.textOnAccent} />
                  <Text style={styles.goText}>Take me there</Text>
                </TouchableOpacity>
              )}

              {!mine && (
                <View style={styles.shareBox}>
                  {reported ? (
                    <Text style={styles.shareText}>
                      Thanks. If enough drivers report it, it stops being shown while we look at it.
                    </Text>
                  ) : reporting ? (
                    <>
                      <Text style={styles.shareText}>What is wrong with it?</Text>
                      {PLACE_REPORT_REASONS.map(({ reason, label }) => (
                        <TouchableOpacity
                          key={reason}
                          style={[styles.share, reportPlace.isPending && styles.disabled]}
                          disabled={reportPlace.isPending}
                          onPress={() =>
                            reportPlace.mutate(
                              { id: place.id, reason },
                              {
                                onSuccess: () => setReported(true),
                                onError: () => setProblem('Couldn’t send the report. Try again.'),
                              },
                            )
                          }
                          testID={`place-report-${reason}`}
                        >
                          <Text style={styles.shareButtonText}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </>
                  ) : (
                    <TouchableOpacity
                      style={styles.linkButton}
                      onPress={() => setReporting(true)}
                      testID="place-report-button"
                    >
                      <Text style={styles.deleteText}>Report this place</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {mine && (
                <TouchableOpacity
                  style={[styles.delete, remove.isPending && styles.disabled]}
                  disabled={remove.isPending}
                  onPress={() =>
                    remove.mutate(place.id, {
                      onSuccess: onClose,
                      onError: (error) =>
                        setProblem(
                          error instanceof ApiError && error.status === 403
                            ? 'Only the driver who marked it, or dispatch, can remove it.'
                            : 'Couldn’t remove it. Try again.',
                        ),
                    })
                  }
                  testID="place-delete-button"
                >
                  <Text style={styles.deleteText}>Remove this place</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.close} onPress={onClose} testID="place-close-button">
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
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
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceStrong,
      marginBottom: 14,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    badge: {
      width: 52,
      height: 52,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    titleText: { flex: 1 },
    title: { fontSize: 24, fontWeight: '700', color: colors.text },
    status: { fontSize: 14, color: colors.textMuted },
    label: { fontSize: 14, fontWeight: '600', color: colors.textMuted, marginTop: 18 },
    input: {
      marginTop: 6,
      minHeight: 84,
      borderRadius: 14,
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 17,
      color: colors.text,
      textAlignVertical: 'top',
    },
    saveNote: {
      marginTop: 10,
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    saveNoteText: { fontSize: 17, fontWeight: '700', color: colors.textOnAccent },
    error: { fontSize: 15, color: colors.danger, marginTop: 10 },
    readNote: { marginTop: 6, fontSize: 17, color: colors.text },
    linkButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    linkButtonText: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
    shareBox: { marginTop: 16, gap: 8 },
    shareText: { fontSize: 15, color: colors.textSecondary },
    share: {
      minHeight: 48,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    shareButtonText: { fontSize: 16, fontWeight: '700', color: colors.accent },
    go: {
      marginTop: 18,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.accent,
      flexDirection: 'row',
      gap: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    goText: { fontSize: 18, fontWeight: '700', color: colors.textOnAccent },
    delete: { marginTop: 14, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
    deleteText: { fontSize: 16, fontWeight: '600', color: colors.danger },
    close: {
      marginTop: 4,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.textDim,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeText: { fontSize: 18, fontWeight: '700', color: colors.text },
    disabled: { opacity: 0.5 },
  });
}
