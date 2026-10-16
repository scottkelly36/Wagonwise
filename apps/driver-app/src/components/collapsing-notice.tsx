import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import type { NoticeMode } from '../lib/notice-state';
import { useThemeColors, type ThemeColors } from '../theme/colors';
import { Icon, type IconName } from './ui/icon';

interface Props {
  readonly mode: NoticeMode;
  readonly onExpand: () => void;
  readonly onDismiss: () => void;
  /** Shown on the small flag, and read out for it. */
  readonly flagIcon: IconName;
  readonly flagLabel: string;
  readonly flagColor: string;
  readonly testID: string;
  readonly children: ReactNode;
}

/**
 * Wraps a notice over the map. Open, it shows the notice with a dismiss button; shrunk, a small flag with a "!" that opens it
 * again; dismissed, nothing. `useCollapsingNotice` decides which and when.
 */
export function CollapsingNotice({
  mode,
  onExpand,
  onDismiss,
  flagIcon,
  flagLabel,
  flagColor,
  testID,
  children,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (mode === 'hidden') return null;

  if (mode === 'flag') {
    return (
      <TouchableOpacity
        style={styles.flag}
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={`Show: ${flagLabel}`}
        testID={`${testID}-flag`}
      >
        <Icon name={flagIcon} size={24} color={flagColor} />
        <View style={styles.bang}>
          <Text style={styles.bangText}>!</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View testID={testID}>
      {children}
      <TouchableOpacity
        style={styles.dismiss}
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Dismiss: ${flagLabel}`}
        testID={`${testID}-dismiss`}
      >
        <Icon name="close" size={20} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    flag: {
      alignSelf: 'flex-start',
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bang: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.danger,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bangText: { color: colors.textOnAccent, fontSize: 13, fontWeight: '800' },
    dismiss: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
