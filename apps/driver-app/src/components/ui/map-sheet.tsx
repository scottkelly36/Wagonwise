import { useRouter } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { cardStyle, radius } from '../../theme/tokens';
import { RoundButton } from './round-button';

interface Props {
  /** The map, which fills the top of the screen under the status bar. */
  readonly map: ReactNode;
  /** The form or details in the sheet below it. */
  readonly children: ReactNode;
}

/**
 * A map with a sheet under it, for the screens where a driver drops a pin and fills in a few
 * details (report a hazard, traffic, parking). The map runs to the top edge with a round Back button
 * over it; the sheet is a lifted card that scrolls, and pads for the Android navigation bar so its
 * last button is never underneath. When the keyboard opens, the map gives way, not the form.
 */
export function MapSheet({ map, children }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        // 'height' rather than undefined on Android, since the app's edge-to-edge layout does not
        // reliably get a windowSoftInputMode=adjustResize resize on its own.
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {map}
        <View style={[styles.back, { top: insets.top + 8 }]} pointerEvents="box-none">
          <RoundButton
            icon="chevron-left"
            label="Back"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
            testID="back-button"
          />
        </View>
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={[
            styles.sheetContent,
            { paddingBottom: Math.max(insets.bottom, 12) + 8 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    flex: { flex: 1 },
    back: { position: 'absolute', left: 16 },
    sheet: {
      ...cardStyle(colors),
      maxHeight: '58%',
      flexGrow: 0,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: radius.sheet,
      borderTopRightRadius: radius.sheet,
    },
    sheetContent: { paddingHorizontal: 16, paddingTop: 18, gap: 8 },
  });
}
