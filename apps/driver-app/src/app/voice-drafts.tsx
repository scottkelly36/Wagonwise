import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useDiscardVoiceDraft, useFileVoiceDraft, useVoiceDrafts } from '../api/use-voice-drafts';
import type { VoiceHazardDraft } from '../db/voice-draft-queue';
import { useCurrentLocation } from '../hooks/use-current-location';
import { formatDateTime } from '../lib/format-date';
import { HAZARD_TYPE_LABELS } from '../lib/hazard-labels';
import { formatHeightWithFeetInches } from '../lib/units';

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
            <ActivityIndicator color="#0B1220" />
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
            <ActivityIndicator color="#FFFFFF" />
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Saved reports</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={styles.loading} size="large" color="#FFFFFF" />
      ) : isError ? (
        <Text style={styles.message}>Couldn’t load saved reports. Pull down to try again.</Text>
      ) : data === undefined || data.length === 0 ? (
        <Text style={styles.message}>
          No saved reports — anything you don’t confirm by voice while driving shows up here.
        </Text>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
          renderItem={({ item }) => <DraftRow draft={item} fallbackOrigin={location.point} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  header: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loading: {
    marginTop: 48,
  },
  message: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 48,
    paddingHorizontal: 24,
  },
  row: {
    gap: 4,
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  rowType: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowDetail: {
    fontSize: 15,
    color: '#E5E7EB',
  },
  rowTranscript: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },
  rowMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  rowHint: {
    fontSize: 13,
    color: '#F87171',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportButton: {
    backgroundColor: '#F5A623',
  },
  discardButton: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#6B7280',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0B1220',
  },
  discardButtonText: {
    color: '#FFFFFF',
  },
});
