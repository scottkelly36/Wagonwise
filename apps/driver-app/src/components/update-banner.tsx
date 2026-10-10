import * as Updates from 'expo-updates';
import { useMemo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUpdateNotice } from '../hooks/use-update-notice';
import { useUpdateNoticeStore } from '../state/update-notice-store';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { cardStyle } from '../theme/tokens';

const open = (url: string | undefined): void => {
  if (url !== undefined) void Linking.openURL(url);
};

/**
 * Tells the driver there is an update. A downloaded over-the-air update: "Restart" applies it at once. A newer build: "Update"
 * opens the store, and "Not now" hides it until a newer one. A build too old to go on with covers the screen, because the server
 * has said it must be updated; it is only ever shown when that has been set on purpose.
 */
export function UpdateBanner() {
  const notice = useUpdateNotice();
  const dismiss = useUpdateNoticeStore((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (notice.kind === 'none') return null;

  if (notice.kind === 'required') {
    return (
      <View style={styles.blocker} testID="update-required">
        <Text style={styles.blockerTitle}>Please update WagonWise</Text>
        <Text style={styles.blockerBody}>
          This version is too old to keep working. Update it, then open the app again.
        </Text>
        {notice.url !== undefined && (
          <TouchableOpacity
            style={styles.primary}
            onPress={() => open(notice.url)}
            accessibilityRole="button"
            testID="update-required-button"
          >
            <Text style={styles.primaryText}>Update</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View
      style={[styles.banner, { top: insets.top + 8 }]}
      pointerEvents="box-none"
      testID="update-banner"
    >
      <View style={styles.card}>
        <Text style={styles.text}>
          {notice.kind === 'restart'
            ? 'An update is ready.'
            : `A new version of WagonWise${notice.version === undefined ? '' : ` (${notice.version})`} is available.`}
        </Text>
        <View style={styles.actions}>
          {notice.kind === 'build' && (
            <TouchableOpacity
              onPress={() => void dismiss(notice.version)}
              accessibilityRole="button"
              testID="update-dismiss"
            >
              <Text style={styles.secondaryText}>Not now</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.primary}
            onPress={() =>
              notice.kind === 'restart' ? void Updates.reloadAsync() : open(notice.url)
            }
            accessibilityRole="button"
            testID="update-action"
          >
            <Text style={styles.primaryText}>
              {notice.kind === 'restart' ? 'Restart' : 'Update'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: { position: 'absolute', left: 12, right: 12, zIndex: 50 },
    card: {
      ...cardStyle(colors),
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    text: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    primary: {
      minHeight: 40,
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { fontSize: 15, fontWeight: '700', color: colors.textOnAccent },
    secondaryText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
    blocker: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 100,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 32,
    },
    blockerTitle: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
    blockerBody: { fontSize: 17, color: colors.textSecondary, textAlign: 'center' },
  });
}
