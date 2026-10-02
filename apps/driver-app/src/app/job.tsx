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
import { useJobStatusVoice } from '../hooks/use-job-status-voice';
import { jobsErrorMessage } from '../lib/error-messages';
import { JOB_STATUS_LABELS, NEXT_STEP } from '../lib/job-status';
import {
  isBusy as isVoiceBusy,
  isListening as isVoiceListening,
} from '../lib/job-status-voice-reducer';
import { useThemeColors, type ThemeColors } from '../theme/colors';

const STOP_KIND_LABELS = { pickup: 'Pickup', delivery: 'Delivery' } as const;

const VOICE_LABEL: Record<string, string> = {
  idle: 'Report by voice',
  'capturing-report': 'Listening… tap to cancel',
  'not-understood': "Didn't catch that — tap to try again",
  confirming: 'Confirm out loud…',
  'capturing-confirmation': 'Listening for yes or no… tap to cancel',
  advancing: 'Saving…',
  advanced: 'Report by voice',
  declined: 'Report by voice',
  error: 'Tap to try again',
};

/**
 * "My current job" (P2-M5.2, design doc §5): the job's stops, its status, and one big button for
 * the single next step — "Arrived at pickup" → "Loaded" → "Set off" → "Arrived" → "Delivered".
 * Reached from `/home`'s banner, which only shows while a job is active, so landing here with no
 * job (just delivered it elsewhere, or a stale deep link) sends the driver back there rather than
 * rendering a dead screen. Hands-free status updates by voice (M5.3, "loaded and leaving") sit
 * alongside the tap button, reusing the Phase 1 voice pipeline with a spoken confirm — geofence
 * nudges (M5.4) and proof of delivery (M5.5) aren't built yet.
 */
export default function JobScreen() {
  const job = useCurrentJob();
  const advance = useAdvanceJobStatus();
  // Hooks can't be conditional, so this is wired up before `job.data` is known to exist — it does
  // nothing (and the button that would start it isn't rendered) until there's a real job.
  const voice = useJobStatusVoice(job.data?.id ?? '', job.data?.status ?? 'draft');
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
  const voiceBusy = isVoiceBusy(voice.state);
  const voiceListening = isVoiceListening(voice.state);

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
        {voice.state.phase === 'confirming' && (
          <Text style={styles.voiceFootnote} testID="job-voice-prompt">
            “{voice.state.step.label} — is that right?”
          </Text>
        )}
      </ScrollView>

      {nextStep && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              (advance.isPending || voiceBusy || voiceListening) && styles.buttonDisabled,
            ]}
            disabled={advance.isPending || voiceBusy || voiceListening}
            onPress={handleAdvance}
            testID="job-advance-button"
          >
            {advance.isPending ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <Text style={styles.buttonText}>{nextStep.label}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.voiceButton,
              voiceListening && styles.voiceButtonListening,
              advance.isPending && styles.buttonDisabled,
            ]}
            disabled={advance.isPending}
            onPress={voiceListening ? voice.cancel : voice.start}
            testID="job-voice-button"
          >
            <Text style={styles.voiceButtonText}>{VOICE_LABEL[voice.state.phase]}</Text>
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
    voiceFootnote: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: 'center',
      fontStyle: 'italic',
    },
    footer: {
      padding: 16,
      gap: 12,
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
    voiceButton: {
      minHeight: 56,
      borderRadius: 28,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    voiceButtonListening: {
      backgroundColor: 'rgba(248, 113, 113, 0.8)',
    },
    voiceButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
  });
}
