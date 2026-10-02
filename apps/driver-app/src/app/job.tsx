import { Redirect } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAdvanceJobStatus, useCurrentJob } from '../api/use-jobs';
import { jobsErrorMessage } from '../lib/error-messages';
import { JOB_STATUS_LABELS, NEXT_STEP } from '../lib/job-status';
import { useThemeColors, type ThemeColors } from '../theme/colors';

const STOP_KIND_LABELS = { pickup: 'Pickup', delivery: 'Delivery' } as const;

/**
 * "My current job" (P2-M5.2, design doc §5): the job's stops, its status, and one big button for
 * the single next step — "Arrived at pickup" → "Loaded" → "Set off" → "Arrived" → "Delivered".
 * Reached from `/home`'s banner, which only shows while a job is active, so landing here with no
 * job (just delivered it elsewhere, or a stale deep link) sends the driver back there rather than
 * rendering a dead screen. Voice status updates (M5.3), geofence nudges (M5.4) and proof of
 * delivery (M5.5) aren't built yet — this is tap-only for now.
 */
export default function JobScreen() {
  const job = useCurrentJob();
  const advance = useAdvanceJobStatus();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (job.isPending) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.text} />
      </SafeAreaView>
    );
  }

  if (!job.data) {
    return <Redirect href="/home" />;
  }

  const current = job.data;
  const nextStep = NEXT_STEP[current.status];

  function handleAdvance(): void {
    if (!nextStep || advance.isPending) return;
    advance.mutate({ jobId: current.id, status: nextStep.to });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.reference}>{current.reference}</Text>
        <Text style={styles.status}>{JOB_STATUS_LABELS[current.status]}</Text>

        <View style={styles.section}>
          {current.stops.map((stop, index) => (
            <View key={index} style={styles.stop}>
              <Text style={styles.stopKind}>{STOP_KIND_LABELS[stop.kind]}</Text>
              <Text style={styles.stopName}>{stop.name}</Text>
              {stop.notes !== undefined && <Text style={styles.stopNotes}>{stop.notes}</Text>}
            </View>
          ))}
        </View>

        {advance.isError && <Text style={styles.error}>{jobsErrorMessage(advance.error)}</Text>}
      </ScrollView>

      {nextStep && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, advance.isPending && styles.buttonDisabled]}
            disabled={advance.isPending}
            onPress={handleAdvance}
            testID="job-advance-button"
          >
            {advance.isPending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>{nextStep.label}</Text>
            )}
          </TouchableOpacity>
        </View>
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
    content: {
      padding: 16,
      gap: 16,
    },
    reference: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
    },
    status: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.accentBlue,
    },
    section: {
      gap: 12,
    },
    stop: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      gap: 4,
    },
    stopKind: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    stopName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    stopNotes: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    error: {
      fontSize: 15,
      color: colors.danger,
      textAlign: 'center',
    },
    footer: {
      padding: 16,
    },
    button: {
      minHeight: 64,
      borderRadius: 32,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
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
