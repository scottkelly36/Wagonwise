import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useDiscardVoiceDraft,
  useFileVoiceDraft,
  useVoiceDrafts,
} from '../../api/use-voice-drafts';
import type { VoiceHazardDraft } from '../../db/voice-draft-queue';
import { useCurrentLocation } from '../../hooks/use-current-location';
import { formatDateTime } from '../../lib/format-date';
import { HAZARD_TYPE_LABELS } from '../../lib/hazard-labels';
import { formatHeightWithFeetInches } from '../../lib/units';
import { Icon } from '../../components/ui/icon';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle } from '../../theme/tokens';

function formatMeasurement(measurement: {
  readonly kind: 'height' | 'width' | 'weight';
  readonly value: number;
  readonly unit: string;
}): string {
  if (measurement.kind === 'height') {
    return formatHeightWithFeetInches(measurement.value);
  }
  return `${measurement.value}${measurement.unit}`;
}

interface DraftRowProps {
  readonly draft: VoiceHazardDraft;
  readonly fallbackOrigin: { readonly lat: number; readonly lon: number } | undefined;
}

function DraftRow({ draft, fallbackOrigin }: DraftRowProps) {
  const fileMutation = useFileVoiceDraft();
  const discardMutation = useDiscardVoiceDraft();
  const origin = draft.origin ?? fallbackOrigin;
  const pending = fileMutation.isPending || discardMutation.isPending;
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row} testID={`voice-draft-row-${draft.id}`}>
      <Text style={styles.rowType}>{HAZARD_TYPE_LABELS[draft.parsed.type]}</Text>
      {draft.parsed.measurement !== undefined && (
        <Text style={styles.rowDetail}>{formatMeasurement(draft.parsed.measurement)}</Text>
      )}
      {draft.parsed.positionHint !== undefined && (
        <Text style={styles.rowDetail}>{draft.parsed.positionHint}</Text>
      )}
      <Text style={styles.rowTranscript}>“{draft.transcript}”</Text>
      <Text style={styles.rowMeta}>{formatDateTime(draft.createdAt)}</Text>

      {origin === undefined && (
        <Text style={styles.rowHint}>Turn on location to report this one.</Text>
      )}
      {fileMutation.isError && <Text style={styles.rowHint}>Couldn’t save that — try again.</Text>}

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[
            styles.button,
            styles.reportButton,
            (pending || origin === undefined) && styles.buttonDisabled,
          ]}
          disabled={pending || origin === undefined}
          onPress={() => origin !== undefined && fileMutation.mutate({ draft, origin })}
          testID={`voice-draft-report-${draft.id}`}
        >
          {fileMutation.isPending ? (
            <ActivityIndicator color={colors.textOnAccent} />
          ) : (
            <Text style={styles.buttonText}>Report it</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.discardButton, pending && styles.buttonDisabled]}
          disabled={pending}
          onPress={() => discardMutation.mutate(draft.id)}
          testID={`voice-draft-discard-${draft.id}`}
        >
          {discardMutation.isPending ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={[styles.buttonText, styles.discardButtonText]}>Discard</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * Review, file or discard saved voice-report drafts (design doc §7 step 4: "saved as an
 * unconfirmed draft for review later when parked" — M7.3's own storage layer with no UI reading
 * from it until now). Location falls back to the driver's current position when the draft itself
 * has none (captured with no GPS fix) — the same `effectivePin ?? location.point` shape
 * `report-hazard.tsx` already uses, reasonable here since reviewing drafts is a parked-use screen.
 */
export default function VoiceDraftsScreen() {
  const { data, isLoading, isError, isRefetching, refetch } = useVoiceDrafts();
  const location = useCurrentLocation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved</Text>
        <Text style={styles.subtitle}>Reports to check and send when you are parked.</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color={colors.text} />
      ) : isError ? (
        <View style={styles.empty}>
          <Icon name="cloud-alert-outline" size={52} color={colors.textMuted} />
          <Text style={styles.message}>Couldn’t load saved reports. Pull down to try again.</Text>
        </View>
      ) : data === undefined || data.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="bookmark-outline" size={52} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Nothing saved</Text>
          <Text style={styles.message}>
            Anything you don’t confirm by voice while driving shows up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          renderItem={({ item }) => <DraftRow draft={item} fallbackOrigin={location.point} />}
        />
      )}
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 4,
    },
    title: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.text,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textMuted,
    },
    list: {
      padding: 16,
      gap: 12,
    },
    empty: {
      ...cardStyle(colors),
      margin: 16,
      padding: 28,
      alignItems: 'center',
      gap: 10,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    loading: {
      marginTop: 48,
    },
    message: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: 'center',
    },
    row: {
      ...cardStyle(colors),
      gap: 4,
      padding: 16,
    },
    rowType: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    rowDetail: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    rowTranscript: {
      fontSize: 14,
      color: colors.textMuted,
      fontStyle: 'italic',
      marginTop: 4,
    },
    rowMeta: {
      fontSize: 13,
      color: colors.textDim,
      marginTop: 4,
    },
    rowHint: {
      fontSize: 13,
      color: colors.danger,
      marginTop: 4,
    },
    actionRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 12,
    },
    button: {
      flex: 1,
      minHeight: 52,
      borderRadius: 26,
      justifyContent: 'center',
      alignItems: 'center',
    },
    reportButton: {
      backgroundColor: colors.accent,
    },
    discardButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.textDim,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textOnAccent,
    },
    discardButtonText: {
      color: colors.text,
    },
  });
}
