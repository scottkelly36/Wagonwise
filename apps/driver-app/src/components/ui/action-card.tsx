import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

import { cardStyle } from '../../theme/tokens';
import { useThemeColors, type ThemeColors } from '../../theme/colors';
import { Icon, type IconName } from './icon';

/** Each quick action's own icon colour, so they can be told apart at a glance. */
export const ACTION_COLOURS = {
  traffic: '#F0452B',
  hazard: '#F97316',
  parking: '#1A73E8',
} as const;

interface Props {
  readonly icon: IconName;
  /** The icon's own colour: each quick action has its own, so they can be told apart at a glance. */
  readonly iconColor: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  /** Smaller, for over the map while driving, so less of it is covered. */
  readonly compact?: boolean;
  /** In use (e.g. listening): filled in the danger colour with white contents. */
  readonly active?: boolean;
  readonly disabled?: boolean;
}

/** A quick action on the map: a big coloured icon over a short label, on a lifted card. Sized to be
 *  hit with a glove or a thumb, not a fingertip. */
export function ActionCard({
  icon,
  iconColor,
  label,
  onPress,
  testID,
  compact = false,
  active = false,
  disabled = false,
}: Props) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={[
        styles.card,
        compact && styles.cardCompact,
        active && { backgroundColor: colors.danger },
        disabled && styles.disabled,
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name={icon} size={compact ? 26 : 32} color={active ? '#FFFFFF' : iconColor} />
      <Text
        style={[styles.label, compact && styles.labelCompact, active && { color: '#FFFFFF' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      ...cardStyle(colors),
      flex: 1,
      minHeight: 72,
      paddingVertical: 10,
      paddingHorizontal: 6,
      gap: 4,
      justifyContent: 'center',
      alignItems: 'center',
    },
    cardCompact: { minHeight: 58, paddingVertical: 8, gap: 2 },
    disabled: { opacity: 0.5 },
    labelCompact: { fontSize: 13 },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
  });
}
