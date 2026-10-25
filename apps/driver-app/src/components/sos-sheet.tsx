import type { RaiseSosResponse } from '@wagonwise/contracts/sos';
import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCancelSos, useRaiseSos } from '../api/use-sos';
import {
  NOT_EMERGENCY_SERVICES,
  outcomeText,
  positionText,
  readOutLines,
  readOutText,
} from '../lib/sos-messages';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { radius } from '../theme/tokens';
import { Icon } from './ui/icon';
import type { MapPoint } from './route-map';

/** How long the button is held before SOS is sent: long enough that a pocket or a stray tap cannot do it. */
const HOLD_MS = 2000;
const SOS_RED = '#DC2626';

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  /** Where the driver is now. Without a position the button cannot be held. */
  readonly point: MapPoint | undefined;
}

type Phase =
  | { readonly kind: 'ready' }
  | { readonly kind: 'sent'; readonly sent: RaiseSosResponse }
  | { readonly kind: 'cancelled' };

function callEmergencyServices(): void {
  void Linking.openURL('tel:999');
}

/**
 * SOS, as a bottom sheet. Press and hold the red button for two seconds and the companies the driver drives for are told where
 * they are (the three words for the spot, their name and number, the vehicle and the job); a driver with no company is shown the
 * three words to read out. The sheet always says that WagonWise does not call the emergency services, and always has a button that
 * does. Mounted only while open, so each press starts from the beginning.
 */
export function SosSheet(props: Props) {
  return props.visible ? <SosSheetBody {...props} /> : null;
}

function SosSheetBody({ onClose, point }: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const raise = useRaiseSos();
  const cancel = useCancelSos();
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  // One id for the whole press, kept for a retry and for cancelling, so the office is never told twice.
  const requestId = useRef<string | undefined>(undefined);
  const [heldFor] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    },
    [],
  );

  function send(): void {
    if (point === undefined || raise.isPending) return;
    requestId.current ??= Crypto.randomUUID();
    Vibration.vibrate(400);
    raise.mutate(
      { requestId: requestId.current, location: { lat: point.lat, lon: point.lon } },
      { onSuccess: (sent) => setPhase({ kind: 'sent', sent }) },
    );
  }

  function holdStart(): void {
    if (point === undefined || raise.isPending) return;
    heldFor.setValue(0);
    Animated.timing(heldFor, { toValue: 1, duration: HOLD_MS, useNativeDriver: false }).start();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      send();
    }, HOLD_MS);
  }

  function holdEnd(): void {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    Animated.timing(heldFor, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  }

  const fillWidth = heldFor.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>SOS</Text>

            {phase.kind === 'ready' && (
              <>
                <Text style={styles.text}>
                  Press and hold the red button for two seconds. Your company is told where you are,
                  with your name, number and vehicle. If you don’t drive for a company in WagonWise,
                  you are shown your three words to read out.
                </Text>
                <Text style={styles.strong}>{NOT_EMERGENCY_SERVICES}</Text>

                <Pressable
                  style={[styles.hold, (point === undefined || raise.isPending) && styles.disabled]}
                  onPressIn={holdStart}
                  onPressOut={holdEnd}
                  disabled={point === undefined || raise.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Press and hold to send SOS"
                  testID="sos-hold-button"
                >
                  <Animated.View style={[styles.holdFill, { width: fillWidth }]} />
                  {raise.isPending ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.holdText}>
                      {point === undefined ? 'Waiting for your position…' : 'HOLD TO SEND SOS'}
                    </Text>
                  )}
                </Pressable>

                {raise.isError && (
                  <View style={styles.failed} testID="sos-failed">
                    <Text style={styles.failedTitle}>It could not be sent.</Text>
                    <Text style={styles.text}>
                      Your phone could not reach WagonWise. Nobody has been told. Call 999 if you
                      need help
                      {point === undefined ? '.' : `, and say you are at ${positionText(point)}.`}
                    </Text>
                    <TouchableOpacity
                      style={styles.retry}
                      onPress={send}
                      accessibilityRole="button"
                      testID="sos-retry-button"
                    >
                      <Text style={styles.retryText}>Try again</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}

            {phase.kind === 'sent' && (
              <>
                <View
                  style={styles.readOutBox}
                  testID="sos-words"
                  accessibilityLabel={readOutText(phase.sent)}
                >
                  {readOutLines(phase.sent).map((line) => (
                    <Text key={line} style={styles.readOut}>
                      {line}
                    </Text>
                  ))}
                </View>
                {phase.sent.nearestPlace !== undefined && (
                  <Text style={styles.near}>near {phase.sent.nearestPlace}</Text>
                )}
                {phase.sent.words !== undefined && (
                  <Text style={styles.small}>
                    Those three words name a 3 m square where you are.
                  </Text>
                )}
                <Text style={styles.text} testID="sos-outcome">
                  {outcomeText(phase.sent)}
                </Text>
                <Text style={styles.strong}>{NOT_EMERGENCY_SERVICES}</Text>
              </>
            )}

            {phase.kind === 'cancelled' && (
              <Text style={styles.text} testID="sos-cancelled">
                Cancelled. Your company has been told it was a mistake, or that you are all right.
              </Text>
            )}

            <TouchableOpacity
              style={styles.call}
              onPress={callEmergencyServices}
              accessibilityRole="button"
              testID="sos-call-999-button"
            >
              <Icon name="phone" size={26} color="#FFFFFF" />
              <Text style={styles.callText}>Call 999</Text>
            </TouchableOpacity>

            {phase.kind === 'sent' && phase.sent.notified.length > 0 && (
              <>
                <TouchableOpacity
                  style={[styles.secondary, cancel.isPending && styles.disabled]}
                  disabled={cancel.isPending}
                  onPress={() =>
                    cancel.mutate(phase.sent.requestId, {
                      onSuccess: () => setPhase({ kind: 'cancelled' }),
                    })
                  }
                  accessibilityRole="button"
                  testID="sos-cancel-button"
                >
                  <Text style={styles.secondaryText}>It was a mistake, or I’m all right</Text>
                </TouchableOpacity>
                {cancel.isError && (
                  <Text style={styles.errorText}>
                    Could not tell your company. Ring them to say you are all right.
                  </Text>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.close}
              onPress={onClose}
              accessibilityRole="button"
              testID="sos-close-button"
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </ScrollView>
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
      maxHeight: '92%',
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceStrong,
      marginBottom: 14,
    },
    title: { fontSize: 28, fontWeight: '800', color: SOS_RED },
    text: { fontSize: 16, color: colors.textSecondary, marginTop: 8 },
    strong: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 10 },
    small: { fontSize: 14, color: colors.textMuted, marginTop: 4 },
    hold: {
      marginTop: 18,
      minHeight: 96,
      borderRadius: 20,
      backgroundColor: '#7F1D1D',
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    holdFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: SOS_RED },
    holdText: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
    disabled: { opacity: 0.5 },
    failed: { marginTop: 14 },
    failedTitle: { fontSize: 18, fontWeight: '800', color: colors.danger },
    retry: {
      marginTop: 10,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    retryText: { fontSize: 17, fontWeight: '700', color: colors.accent },
    readOutBox: { marginTop: 14 },
    readOut: { fontSize: 34, fontWeight: '800', color: colors.text, lineHeight: 40 },
    near: { fontSize: 18, color: colors.textSecondary, marginTop: 2 },
    call: {
      marginTop: 18,
      minHeight: 64,
      borderRadius: 18,
      backgroundColor: SOS_RED,
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    callText: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
    secondary: {
      marginTop: 12,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.textDim,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 12,
    },
    secondaryText: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
    errorText: { fontSize: 15, color: colors.danger, marginTop: 8 },
    close: {
      marginTop: 12,
      minHeight: 52,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
    },
    closeText: { fontSize: 18, fontWeight: '700', color: colors.textMuted },
  });
}
