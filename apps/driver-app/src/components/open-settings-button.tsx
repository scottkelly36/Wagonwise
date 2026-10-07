import { useMemo } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { useThemeColors, type ThemeColors } from '../theme/colors';

/** Opens this app's page in the phone's settings, where a denied permission (the microphone) can be
 *  turned back on. Android will not ask again once a driver has said no. */
export function OpenSettingsButton() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => void Linking.openSettings()}
      accessibilityRole="button"
      testID="open-settings-button"
    >
      <Text style={styles.text}>Open settings</Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    button: {
      minHeight: 48,
      paddingHorizontal: 20,
      borderRadius: 16,
      backgroundColor: colors.accent,
      justifyContent: 'center',
      alignItems: 'center',
      alignSelf: 'center',
    },
    text: { fontSize: 16, fontWeight: '700', color: colors.textOnAccent },
  });
}
