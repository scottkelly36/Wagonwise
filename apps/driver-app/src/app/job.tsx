import { Redirect } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAdvanceJobStatus, useCurrentJob } from '../api/use-jobs';
import { useJobNavigation } from '../hooks/use-job-navigation';
import { useJobStatusVoice } from '../hooks/use-job-status-voice';
import { useProofOfDeliveryCapture } from '../hooks/use-proof-of-delivery';
import { jobNavigationErrorMessage, jobsErrorMessage } from '../lib/error-messages';
import {
  isTripToTarget,
  jobActions,
  navigationTarget,
  type JobAction,
} from '../lib/job-navigation';
import { isTrackedStatus } from '../lib/job-position-reporting';
import { JOB_STATUS_LABELS, NEXT_STEP } from '../lib/job-status';
import {
  isBusy as isVoiceBusy,
  isListening as isVoiceListening,
} from '../lib/job-status-voice-reducer';
import {
  isDeliveryBlockedByProof,
  PROOF_STATUS_MESSAGES,
  proofOfDeliveryStatus,
} from '../lib/proof-of-delivery';
import { useCurrentActiveTripStore } from '../state/current-active-trip-store';
import { useCurrentRoutePlanStore } from '../state/current-route-plan-store';
import { Icon } from '../components/ui/icon';
import { ScreenHeader } from '../components/ui/screen-header';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle, radius } from '../theme/tokens';

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
 * nudges (M5.4) arrive as an alert on `/home`. At the delivery stop, proof of delivery (M5.5) adds a
 * photo section (`useProofOfDeliveryCapture`); a job that requires one can't be marked delivered
 * until the photo has reached the server.
 */
export default function JobScreen() {
  const job = useCurrentJob();
  const advance = useAdvanceJobStatus();
  const navigation = useJobNavigation();
  const trip = useCurrentActiveTripStore((s) => s.trip);
  const plan = useCurrentRoutePlanStore((s) => s.plan);
  // Hooks can't be conditional, so this is wired up before `job.data` is known to exist — it does
  // nothing (and the button that would start it isn't rendered) until there's a real job.
  const voice = useJobStatusVoice(job.data?.id ?? '', job.data?.status ?? 'draft');
  const proof = useProofOfDeliveryCapture(job.data?.id ?? '');
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
  // The photo is taken at the drop, so the section only exists once the driver has arrived.
  const showProof = current.status === 'at_delivery';
  const proofStatus = proofOfDeliveryStatus(current, proof.queuedLocally);
  // Core refuses "Delivered" without the photo on the server, so don't offer a button (or a spoken
  // "delivered") that is certain to fail — the photo section says why.
  const target = navigationTarget(current);
  const tripToTarget =
    trip !== undefined &&
    plan !== undefined &&
    target !== undefined &&
    isTripToTarget(plan.destination, target);
  const actions = jobActions(current.status, tripToTarget);
  const noVehicle = current.vehicleId === undefined;
  const blockedByProof =
    actions?.primary.kind === 'advance' &&
    actions.primary.to === 'delivered' &&
    isDeliveryBlockedByProof(current);
  const working = advance.isPending || navigation.isPending;

  function handleAction(action: JobAction): void {
    if (working || blockedByProof) return;
    if (action.kind === 'advance') {
      advance.mutate({ jobId: current.id, status: action.to });
    } else {
      navigation.mutate({ job: current, advanceFirst: action.advanceFirst });
    }
  }

  // "Start" needs the vehicle the dispatcher assigned. Without one it is held back with the reason,
  // rather than letting the driver be routed for a vehicle nobody chose.
  const navigationBlocked = (action: JobAction): boolean => action.kind === 'navigate' && noVehicle;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenHeader title={current.reference} subtitle={JOB_STATUS_LABELS[current.status]} />
        {isTrackedStatus(current.status) && (
          <View style={styles.notice}>
            <Icon name="map-marker-radius-outline" size={22} color={colors.accent} />
            <Text style={styles.noticeText} testID="job-tracking-notice">
              Your company can see where you are while this job is on the road.
            </Text>
          </View>
        )}

        <View style={styles.section}>
          {current.stops.map((stop, index) => (
            <View key={index} style={styles.stop}>
              <View style={styles.stopBadge}>
                <Icon
                  name={stop.kind === 'pickup' ? 'package-variant' : 'flag-checkered'}
                  size={26}
                  color={colors.accent}
                />
              </View>
              <View style={styles.stopText}>
                <Text style={styles.stopKind}>{STOP_KIND_LABELS[stop.kind]}</Text>
                <Text style={styles.stopName}>{stop.name}</Text>
                {stop.notes !== undefined && <Text style={styles.stopNotes}>{stop.notes}</Text>}
              </View>
            </View>
          ))}
        </View>

        {showProof && (
          <View style={styles.proof} testID="job-proof-section">
            <Text style={styles.proofTitle}>Proof of delivery</Text>
            <Text style={styles.proofMessage} testID="job-proof-message">
              {PROOF_STATUS_MESSAGES[proofStatus]}
            </Text>
            {proof.error !== undefined && <Text style={styles.error}>{proof.error}</Text>}
            <TouchableOpacity
              style={[styles.proofButton, proof.busy && styles.buttonDisabled]}
              disabled={proof.busy}
              onPress={() => void proof.takePhoto()}
              testID="job-proof-button"
            >
              {proof.busy ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.proofButtonText}>
                  {proofStatus === 'optional' || proofStatus === 'required'
                    ? 'Take photo'
                    : 'Retake photo'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {advance.isError && <Text style={styles.error}>{jobsErrorMessage(advance.error)}</Text>}
        {navigation.isError && (
          <Text style={styles.error} testID="job-navigation-error">
            {jobNavigationErrorMessage(navigation.error)}
          </Text>
        )}
        {actions?.primary.kind === 'navigate' && noVehicle && (
          <Text style={styles.error} testID="job-no-vehicle">
            No vehicle has been assigned to this job yet. Ask dispatch to assign one before you
            start.
          </Text>
        )}
        {voice.state.phase === 'confirming' && (
          <Text style={styles.voiceFootnote} testID="job-voice-prompt">
            “{voice.state.step.label} — is that right?”
          </Text>
        )}
      </ScrollView>

      {actions && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              (working ||
                voiceBusy ||
                voiceListening ||
                blockedByProof ||
                navigationBlocked(actions.primary)) &&
                styles.buttonDisabled,
            ]}
            disabled={
              working ||
              voiceBusy ||
              voiceListening ||
              blockedByProof ||
              navigationBlocked(actions.primary)
            }
            onPress={() => handleAction(actions.primary)}
            testID="job-advance-button"
          >
            {working ? (
              <ActivityIndicator color={colors.textOnAccent} />
            ) : (
              <View style={styles.buttonContent}>
                {actions.primary.kind === 'navigate' && (
                  <Icon name="navigation-variant" size={26} color={colors.textOnAccent} />
                )}
                <Text style={styles.buttonText}>{actions.primary.label}</Text>
              </View>
            )}
          </TouchableOpacity>

          {actions.secondary && (
            <TouchableOpacity
              style={[styles.secondaryButton, working && styles.buttonDisabled]}
              disabled={working || voiceBusy || voiceListening}
              onPress={() => actions.secondary && handleAction(actions.secondary)}
              testID="job-secondary-button"
            >
              <Text style={styles.secondaryButtonText}>{actions.secondary.label}</Text>
            </TouchableOpacity>
          )}

          {nextStep && (
            <TouchableOpacity
              style={[
                styles.voiceButton,
                voiceListening && styles.voiceButtonListening,
                (working || blockedByProof) && styles.buttonDisabled,
              ]}
              disabled={working || blockedByProof}
              onPress={voiceListening ? voice.cancel : voice.start}
              testID="job-voice-button"
            >
              <View style={styles.buttonContent}>
                <Icon name="microphone" size={22} color={colors.text} />
                <Text style={styles.voiceButtonText}>{VOICE_LABEL[voice.state.phase]}</Text>
              </View>
            </TouchableOpacity>
          )}
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
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
    },
    noticeText: {
      flex: 1,
      fontSize: 14,
      color: colors.textSecondary,
    },
    section: {
      gap: 12,
    },
    stop: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
    },
    stopBadge: {
      width: 52,
      height: 52,
      borderRadius: radius.badge,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    stopText: {
      flex: 1,
      gap: 2,
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
    proof: {
      ...cardStyle(colors),
      padding: 16,
      gap: 12,
    },
    proofTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    proofMessage: {
      fontSize: 16,
      color: colors.text,
    },
    proofButton: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
      justifyContent: 'center',
      alignItems: 'center',
    },
    proofButtonText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    footer: {
      ...cardStyle(colors),
      borderRadius: radius.sheet,
      marginHorizontal: 12,
      marginBottom: 12,
      padding: 14,
      gap: 12,
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    button: {
      minHeight: 56,
      borderRadius: 16,
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
    secondaryButton: {
      minHeight: 56,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    secondaryButtonText: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    voiceButton: {
      minHeight: 56,
      borderRadius: 16,
      backgroundColor: colors.accentSoft,
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
