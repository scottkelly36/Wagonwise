import { hazardReportIdSchema } from '@wagonwise/contracts/hazards';
import * as Crypto from 'expo-crypto';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReportHazard } from '../api/use-hazards';
import { enqueueHazardReport, removeQueuedHazardReport } from '../db/hazard-queue';
import { fetchCurrentLocation } from '../hooks/use-current-location';
import { CAMERA_CHOICES, type CameraHazardType } from '../lib/camera-report';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { Icon } from './ui/icon';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
}

type Phase = 'choose' | 'sent' | 'queued';

/**
 * Report a camera from the trip screen: one tap on fixed or mobile, saved exactly where the driver is. It is kept on the
 * phone first and sent straight away, so a camera reported with no signal goes when there is some. Cameras are not hazards,
 * so this is its own button and not a choice on the hazard screen.
 */
export function ReportCameraSheet(props: Props) {
  // Mounted only while open, so every opening starts fresh.
  return props.visible ? <ReportCameraForm {...props} /> : null;
}

function ReportCameraForm({ visible, onClose }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const reportHazard = useReportHazard();
  const [phase, setPhase] = useState<Phase>('choose');
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function report(type: CameraHazardType): Promise<void> {
    setProblem(undefined);
    setBusy(true);
    const here = await fetchCurrentLocation();
    if (!here.ok) {
      setBusy(false);
      setProblem('We can’t find where you are. Turn on location and try again.');
      return;
    }
    const request = {
      id: hazardReportIdSchema.parse(Crypto.randomUUID()),
      type,
      location: here.point,
      source: 'tap' as const,
    };
    try {
      await enqueueHazardReport(request);
    } catch {
      setBusy(false);
      setProblem('Couldn’t save that. Try again.');
      return;
    }
    reportHazard.mutate(request, {
      onSuccess: async () => {
        await removeQueuedHazardReport(request.id);
        setBusy(false);
        setPhase('sent');
      },
      // Kept in the phone's queue: it is sent once the app is next online.
      onError: () => {
        setBusy(false);
        setPhase('queued');
      },
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>

        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
          <View style={styles.handle} />
          {phase === 'choose' ? (
            <>
              <Text style={styles.title}>Report a camera</Text>
              <Text style={styles.body}>
                Saved where you are now. Other drivers will be warned.
              </Text>
              {CAMERA_CHOICES.map((choice) => (
                <TouchableOpacity
                  key={choice.type}
                  style={[styles.choice, busy && styles.disabled]}
                  disabled={busy}
                  onPress={() => void report(choice.type)}
                  testID={`report-camera-${choice.type}`}
                >
                  <Icon name={choice.icon} size={30} color={colors.accent} />
                  <View style={styles.choiceText}>
                    <Text style={styles.choiceTitle}>{choice.title}</Text>
                    <Text style={styles.choiceDetail}>{choice.detail}</Text>
                  </View>
                  {busy && <ActivityIndicator color={colors.accent} />}
                </TouchableOpacity>
              ))}
              {problem !== undefined && <Text style={styles.error}>{problem}</Text>}
              <TouchableOpacity
                style={styles.cancel}
                onPress={onClose}
                testID="report-camera-cancel"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.sentRow}>
                <Icon name="check-circle" size={34} color={colors.accent} />
                <Text style={styles.title}>{phase === 'sent' ? 'Reported' : 'Saved'}</Text>
              </View>
              <Text style={styles.body}>
                {phase === 'sent'
                  ? 'Thanks. Other drivers on this road will be warned.'
                  : 'You’re offline right now. It will be sent as soon as you’re back online.'}
              </Text>
              <TouchableOpacity style={styles.done} onPress={onClose} testID="report-camera-done">
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
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
      paddingTop: 10,
      gap: 12,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.surfaceStrong,
      marginBottom: 6,
    },
    title: { fontSize: 22, fontWeight: '800', color: colors.text },
    body: { fontSize: 15, color: colors.textSecondary },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 72,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    choiceText: { flex: 1, gap: 2 },
    choiceTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
    choiceDetail: { fontSize: 13, color: colors.textMuted },
    disabled: { opacity: 0.6 },
    error: { fontSize: 14, color: colors.danger },
    cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
    cancelText: { fontSize: 16, fontWeight: '700', color: colors.textMuted },
    sentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    done: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneText: { fontSize: 18, fontWeight: '800', color: colors.textOnAccent },
  });
}
