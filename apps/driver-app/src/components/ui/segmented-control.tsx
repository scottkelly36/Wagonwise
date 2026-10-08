import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useThemeColors, type ThemeColors } from '../../theme/colors';

interface Option<T extends string> {
  readonly key: T;
  readonly label: string;
}

interface Props<T extends string> {
  readonly options: readonly Option<T>[];
  readonly value: T;
  readonly onChange: (key: T) => void;
  /** Each button gets `${testIDPrefix}-${key}-button`. */
  readonly testIDPrefix: string;
  /** A shorter control, for a row beside a label. */
  readonly compact?: boolean;
}

/** One split button: the choices share a track and the chosen one is filled, so it is plain which is on. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
  compact = false,
}: Props<T>) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.segment, active && styles.segmentActive]}
            onPress={() => onChange(option.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            testID={`${testIDPrefix}-${option.key}-button`}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function createStyles(colors: ThemeColors, compact: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      padding: 4,
      borderRadius: 26,
      backgroundColor: colors.surface,
    },
    segment: {
      flex: 1,
      minHeight: compact ? 40 : 44,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 22,
      paddingHorizontal: 6,
    },
    segmentActive: { backgroundColor: colors.accent },
    text: { fontSize: compact ? 14 : 15, fontWeight: '600', color: colors.textMuted },
    textActive: { color: colors.textOnAccent },
  });
}
