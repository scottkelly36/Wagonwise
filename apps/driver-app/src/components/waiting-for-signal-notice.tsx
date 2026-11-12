import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { refreshPendingArrivals, syncTripOutbox } from '../hooks/use-trip-outbox-flush';
import { useAuthStore } from '../state/auth-store';
import { usePendingArrivalsStore } from '../state/pending-arrivals-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';
import { Icon } from './ui/icon';

/**
 * Says so while something the driver did with no signal (ending a trip, arriving at a stop) is saved on the phone and not yet sent, so they are not left wondering
 * whether it counted. It goes by itself the moment it has been sent. "Send now" tries straight away and says if there is still no signal; the app also tries on
 * its own whenever it opens and whenever it comes back to the front.
 */
export function WaitingForSignalNotice({ style }: { readonly style?: StyleProp<ViewStyle> }) {
  const waiting = usePendingArrivalsStore((s) => s.waiting);
  const state = useAuthStore((s) => s.state);
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sending, setSending] = useState(false);
  const [triedAndFailed, setTriedAndFailed] = useState(false);

  if (waiting === undefined) return null;

  async function sendNow(): Promise<void> {
    if (state.status !== 'signedIn' || sending) return;
    setSending(true);
    setTriedAndFailed(false);
    try {
      await syncTripOutbox(state.accessToken);
      await refreshPendingArrivals();
      // Still saved after trying: there is no signal yet.
      setTriedAndFailed(usePendingArrivalsStore.getState().waiting !== undefined);
    } catch {
      setTriedAndFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={[styles.card, style]} testID="waiting-for-signal">
      <Icon name="signal-off" size={22} color={colors.accent} />
      <View style={styles.text}>
        <Text style={styles.message} testID="waiting-for-signal-message">
          {waiting}
        </Text>
        {triedAndFailed && (
          <Text style={styles.sub} testID="waiting-for-signal-still">
            Still no signal. It is saved and will be sent when you have it.
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => void sendNow()}
        disabled={sending}
        accessibilityRole="button"
        testID="waiting-for-signal-send"
        style={styles.button}
      >
        {sending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.buttonText}>Send now</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    text: { flex: 1 },
    message: { fontSize: 14, fontWeight: '600', color: colors.text },
    sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    button: { minHeight: 44, minWidth: 80, justifyContent: 'center', alignItems: 'center' },
    buttonText: { fontSize: 15, fontWeight: '700', color: colors.accent },
  });
}
